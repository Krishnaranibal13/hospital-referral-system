import express from "express";
import prisma from "../utils/prismaClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { istDateString, startOfIstDay } from "../utils/istDate.js";

const router = express.Router();

// Windows offered by the "Top-performing Marketing Emp" card's period toggle.
const MARKETING_PERIODS = { week: 7, month: 30, "3months": 90, "6months": 180, year: 365 };

// GET /api/dashboard/summary  (admin only) — everything the Admin Dashboard home page needs
// in one call: KPI counts, a 14-day referral trend, top doctors, top marketing employees
// (precomputed for every period so the toggle is instant with no extra requests), recent
// referrals, and currently-unredeemed credits awaiting payout.
router.get("/summary", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const hospitalId = req.user.hospitalId;

  const [doctors, referrals, transactions, marketingPersons] = await Promise.all([
    prisma.doctor.findMany({ where: { hospitalId }, select: { id: true, name: true, clinicName: true, active: true } }),
    prisma.referral.findMany({
      where: { doctor: { hospitalId } },
      select: {
        id: true, patientName: true, patientAge: true, patientGender: true, status: true, createdAt: true,
        doctor: { select: { id: true, name: true, clinicName: true, marketingPersonId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.creditTransaction.findMany({
      where: { doctor: { hospitalId } },
      select: {
        id: true, amount: true, redeemed: true, createdAt: true,
        doctor: { select: { id: true, name: true, clinicName: true, creditAmount: true } },
        referral: { select: { id: true, patientName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.marketingPerson.findMany({ where: { hospitalId }, select: { id: true, name: true } }),
  ]);

  const totalDoctors = doctors.length;
  const activeDoctors = doctors.filter((d) => d.active).length;
  const totalReferrals = referrals.length;
  const pendingReferrals = referrals.filter((r) => r.status === "PENDING").length;
  const totalCreditsRedeemed = transactions.filter((t) => t.redeemed).reduce((s, t) => s + Number(t.amount), 0);
  const totalPendingPayouts = transactions.filter((t) => !t.redeemed).reduce((s, t) => s + Number(t.amount), 0);

  // 14-day referral trend, bucketed by IST calendar day (independent of server timezone)
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = startOfIstDay(i);
    const dayLabel = istDateString(dayStart);
    const count = referrals.filter((r) => istDateString(r.createdAt) === dayLabel).length;
    trend.push({ date: dayLabel, count });
  }

  // Top doctors by total credited (redeemed + pending), descending
  const byDoctor = {};
  for (const t of transactions) {
    const key = t.doctor.id;
    if (!byDoctor[key]) byDoctor[key] = { id: t.doctor.id, name: t.doctor.name, clinicName: t.doctor.clinicName, total: 0, count: 0 };
    byDoctor[key].total += Number(t.amount);
    byDoctor[key].count += 1;
  }
  const topDoctors = Object.values(byDoctor).sort((a, b) => b.total - a.total).slice(0, 15);

  // Top marketing employees, one ranking per toggle period. "Leads" = referrals brought in
  // by doctors linked to that marketing person (any status); "amount" = the credit points
  // those leads generated (redeemed + pending), both counted by the referral's own date so
  // a lead and its credit land in the same bucket even if the credit posted moments later.
  const marketingPersonMap = new Map(marketingPersons.map((m) => [m.id, m]));
  const creditAmountByReferralId = new Map();
  for (const t of transactions) {
    if (t.referral) creditAmountByReferralId.set(t.referral.id, Number(t.amount));
  }

  function topMarketingForPeriod(days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const byPerson = {};
    for (const r of referrals) {
      if (new Date(r.createdAt).getTime() < cutoff) continue;
      const mpId = r.doctor.marketingPersonId;
      if (!mpId || !marketingPersonMap.has(mpId)) continue;
      if (!byPerson[mpId]) byPerson[mpId] = { id: mpId, name: marketingPersonMap.get(mpId).name, leadsCount: 0, amount: 0 };
      byPerson[mpId].leadsCount += 1;
      byPerson[mpId].amount += creditAmountByReferralId.get(r.id) || 0;
    }
    return Object.values(byPerson).sort((a, b) => b.amount - a.amount).slice(0, 15);
  }

  const topMarketingPersons = Object.fromEntries(
    Object.entries(MARKETING_PERIODS).map(([key, days]) => [key, topMarketingForPeriod(days)])
  );

  const recentReferrals = referrals.slice(0, 30);
  const pendingRedemptions = transactions.filter((t) => !t.redeemed).slice(0, 30);

  res.json({
    kpis: {
      totalDoctors,
      activeDoctors,
      totalReferrals,
      pendingReferrals,
      totalCreditsRedeemed,
      totalPendingPayouts,
    },
    trend,
    topDoctors,
    topMarketingPersons,
    recentReferrals,
    pendingRedemptions,
  });
});

export default router;
