import express from "express";
import prisma from "../utils/prismaClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { istDateString, startOfIstDay } from "../utils/istDate.js";

const router = express.Router();

// Windows offered by the period toggle on the "Top-performing doctors", "Top-performing
// Marketing Emp", and "Pending redemptions" cards.
const PERIODS = { week: 7, month: 30, "3months": 90, "6months": 180, year: 365 };

function withinPeriod(date, days) {
  return new Date(date).getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

// GET /api/dashboard/summary  (admin only) — everything the Admin Dashboard home page needs
// in one call: KPI counts, a 14-day referral trend, top doctors, top marketing employees,
// and pending redemptions grouped by doctor — each of the last three precomputed for every
// toggle period so switching is instant with no extra requests — plus recent referrals.
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

  // Top doctors by total credited (redeemed + pending) within the period, by credit date.
  function topDoctorsForPeriod(days) {
    const byDoctor = {};
    for (const t of transactions) {
      if (!withinPeriod(t.createdAt, days)) continue;
      const key = t.doctor.id;
      if (!byDoctor[key]) byDoctor[key] = { id: t.doctor.id, name: t.doctor.name, clinicName: t.doctor.clinicName, total: 0, count: 0 };
      byDoctor[key].total += Number(t.amount);
      byDoctor[key].count += 1;
    }
    return Object.values(byDoctor).sort((a, b) => b.total - a.total).slice(0, 15);
  }
  const topDoctors = Object.fromEntries(Object.entries(PERIODS).map(([key, days]) => [key, topDoctorsForPeriod(days)]));

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
    const byPerson = {};
    for (const r of referrals) {
      if (!withinPeriod(r.createdAt, days)) continue;
      const mpId = r.doctor.marketingPersonId;
      if (!mpId || !marketingPersonMap.has(mpId)) continue;
      if (!byPerson[mpId]) byPerson[mpId] = { id: mpId, name: marketingPersonMap.get(mpId).name, leadsCount: 0, amount: 0 };
      byPerson[mpId].leadsCount += 1;
      byPerson[mpId].amount += creditAmountByReferralId.get(r.id) || 0;
    }
    return Object.values(byPerson).sort((a, b) => b.amount - a.amount).slice(0, 15);
  }
  const topMarketingPersons = Object.fromEntries(Object.entries(PERIODS).map(([key, days]) => [key, topMarketingForPeriod(days)]));

  // Pending redemptions, grouped by doctor (one row per doctor instead of one per patient) so
  // a doctor with many unpaid patients — e.g. "Hospitech" — shows once with a running total.
  // Each group carries its own list of individual pending transactions for the row to expand
  // into on click, without a second request.
  function pendingGroupsForPeriod(days) {
    const byDoctor = {};
    for (const t of transactions) {
      if (t.redeemed || !withinPeriod(t.createdAt, days)) continue;
      const key = t.doctor.id;
      if (!byDoctor[key]) byDoctor[key] = { doctorId: t.doctor.id, doctorName: t.doctor.name, clinicName: t.doctor.clinicName, total: 0, count: 0, transactions: [] };
      byDoctor[key].total += Number(t.amount);
      byDoctor[key].count += 1;
      byDoctor[key].transactions.push({ id: t.id, amount: Number(t.amount), createdAt: t.createdAt, patientName: t.referral?.patientName || null });
    }
    return Object.values(byDoctor).sort((a, b) => b.total - a.total).slice(0, 30);
  }
  const pendingRedemptions = Object.fromEntries(Object.entries(PERIODS).map(([key, days]) => [key, pendingGroupsForPeriod(days)]));

  const recentReferrals = referrals.slice(0, 30);

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
