import express from "express";
import prisma from "../utils/prismaClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { istDateString, startOfIstDay } from "../utils/istDate.js";

const router = express.Router();

// GET /api/dashboard/summary  (admin only) — everything the Admin Dashboard home page needs
// in one call: KPI counts, a 14-day referral trend, top doctors, recent referrals, and
// currently-unredeemed credits awaiting payout.
router.get("/summary", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const hospitalId = req.user.hospitalId;

  const [doctors, referrals, transactions] = await Promise.all([
    prisma.doctor.findMany({ where: { hospitalId }, select: { id: true, name: true, clinicName: true, active: true } }),
    prisma.referral.findMany({
      where: { doctor: { hospitalId } },
      select: {
        id: true, patientName: true, patientAge: true, patientGender: true, status: true, createdAt: true,
        doctor: { select: { id: true, name: true, clinicName: true } },
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
    recentReferrals,
    pendingRedemptions,
  });
});

export default router;
