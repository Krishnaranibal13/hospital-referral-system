import express from "express";
import QRCode from "qrcode";
import { z } from "zod";
import prisma from "../utils/prismaClient.js";
import { requireAuth, requireRole, requireAccess } from "../middleware/auth.js";

const router = express.Router();

const doctorSchema = z.object({
  name: z.string().min(1),
  specialty: z.string().optional(),
  phone: z.string().min(5),
  email: z.string().email().optional().or(z.literal("")),
  clinicName: z.string().optional(),
  city: z.string().optional(),
  creditAmount: z.number().nonnegative().default(0),
});

// GET /api/doctors/lite  — minimal doctor list for filter dropdowns. Available to admins
// and to STAFF (custom-role) accounts that can view or export referrals, since they need
// this to filter reports by doctor without full doctor-management access.
router.get(
  "/lite",
  requireAuth,
  requireAccess(["ADMIN", "RECEPTION"], ["VIEW_REFERRALS", "EXPORT_REPORTS", "MANAGE_REFERRALS", "REDEEM_CREDITS"]),
  async (req, res) => {
    const doctors = await prisma.doctor.findMany({
      where: { hospitalId: req.user.hospitalId },
      select: {
        id: true, name: true, clinicName: true,
        transactions: { where: { redeemed: false }, select: { amount: true } },
      },
      orderBy: { name: "asc" },
    });
    res.json(
      doctors.map((d) => ({
        id: d.id,
        name: d.name,
        clinicName: d.clinicName,
        pendingAmount: d.transactions.reduce((sum, t) => sum + Number(t.amount), 0),
        pendingCount: d.transactions.length,
      }))
    );
  }
);

// POST /api/doctors  (admin) - create a doctor profile within the admin's own hospital
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = doctorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const doctor = await prisma.doctor.create({
    data: { ...parsed.data, hospitalId: req.user.hospitalId },
  });

  const referralUrl = `${process.env.FRONTEND_URL}/refer/${doctor.uniqueCode}`;
  const dashboardUrl = `${process.env.FRONTEND_URL}/doctor/${doctor.uniqueCode}`;
  const qrDataUrl = await QRCode.toDataURL(referralUrl);

  res.status(201).json({ doctor, referralUrl, dashboardUrl, qrDataUrl });
});

// GET /api/doctors  (admin) - list doctors within the admin's own hospital only
router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const doctors = await prisma.doctor.findMany({
    where: { hospitalId: req.user.hospitalId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { referrals: true } },
      transactions: { select: { amount: true, redeemed: true } },
      referrals: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const result = doctors.map((d) => ({
    ...d,
    totalReferrals: d._count.referrals,
    totalCredited: d.transactions.reduce((sum, t) => sum + Number(t.amount), 0),
    totalEarned: d.transactions.filter((t) => t.redeemed).reduce((sum, t) => sum + Number(t.amount), 0),
    totalPending: d.transactions.filter((t) => !t.redeemed).reduce((sum, t) => sum + Number(t.amount), 0),
    pendingCount: d.transactions.filter((t) => !t.redeemed).length,
    lastReferralAt: d.referrals[0]?.createdAt || null,
    transactions: undefined,
    _count: undefined,
    referrals: undefined,
  }));

  res.json(result);
});

// GET /api/doctors/public/:uniqueCode  (public — no auth)
// This is the doctor's own dashboard, reached via their personal QR/link. The uniqueCode
// itself acts as the credential (same trust model as the referral-submission link), so
// only fields the doctor should see about themselves are returned.
router.get("/public/:uniqueCode", async (req, res) => {
  const doctor = await prisma.doctor.findUnique({
    where: { uniqueCode: req.params.uniqueCode },
    include: {
      referrals: { orderBy: { createdAt: "desc" }, include: { transaction: { select: { amount: true, redeemed: true } } } },
      hospital: true,
    },
  });
  if (!doctor || !doctor.active) {
    return res.status(404).json({ error: "This link is not valid or is no longer active" });
  }

  const referralUrl = `${process.env.FRONTEND_URL}/refer/${doctor.uniqueCode}`;
  const qrDataUrl = await QRCode.toDataURL(referralUrl);

  // "Total earned" only counts credits the accountant/admin has actually redeemed
  // (paid out). "Pending credits" is money owed but not yet paid — this is what makes
  // the two dashboard cards move as redemptions happen, rather than both just tracking
  // confirmation time.
  const totalEarned = doctor.referrals.reduce((sum, r) => sum + (r.transaction?.redeemed ? Number(r.transaction.amount) : 0), 0);
  const pendingCredits = doctor.referrals.reduce((sum, r) => sum + (r.transaction && !r.transaction.redeemed ? Number(r.transaction.amount) : 0), 0);

  res.json({
    doctor: {
      name: doctor.name,
      clinicName: doctor.clinicName,
      city: doctor.city,
      creditAmount: doctor.creditAmount,
    },
    hospital: {
      name: doctor.hospital.name,
      branchName: doctor.hospital.branchName,
    },
    referrals: doctor.referrals,
    stats: {
      total: doctor.referrals.length,
      pending: doctor.referrals.filter((r) => r.status === "PENDING").length,
      credited: doctor.referrals.filter((r) => r.status === "CREDITED").length,
      rejected: doctor.referrals.filter((r) => r.status === "REJECTED").length,
      totalEarned,
      pendingCredits,
    },
    referralUrl,
    qrDataUrl,
  });
});

// GET /api/doctors/:id  (admin) - doctor detail + QR + referral/credit history, own hospital only
router.get("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const doctor = await prisma.doctor.findFirst({
    where: { id: req.params.id, hospitalId: req.user.hospitalId },
    include: {
      referrals: { orderBy: { createdAt: "desc" } },
      transactions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });

  const referralUrl = `${process.env.FRONTEND_URL}/refer/${doctor.uniqueCode}`;
  const dashboardUrl = `${process.env.FRONTEND_URL}/doctor/${doctor.uniqueCode}`;
  const qrDataUrl = await QRCode.toDataURL(referralUrl);

  res.json({ doctor, referralUrl, dashboardUrl, qrDataUrl });
});

// PATCH /api/doctors/:id  (admin) - update doctor details, own hospital only
router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const allowed = ["name", "specialty", "phone", "email", "clinicName", "city", "creditAmount", "active"];
  const data = {};
  for (const key of allowed) {
    if (key in req.body) data[key] = req.body[key];
  }

  const existing = await prisma.doctor.findFirst({ where: { id: req.params.id, hospitalId: req.user.hospitalId } });
  if (!existing) return res.status(404).json({ error: "Doctor not found" });

  const doctor = await prisma.doctor.update({ where: { id: req.params.id }, data });
  res.json(doctor);
});

// POST /api/doctors/:id/redeem-all  (admin, or STAFF with REDEEM_CREDITS)
// Marks every currently-unredeemed credit for this doctor as paid out in one action —
// the "redeem by doctor" flow, as opposed to redeeming one referral at a time.
router.post("/:id/redeem-all", requireAuth, requireAccess(["ADMIN"], ["REDEEM_CREDITS"]), async (req, res) => {
  const doctor = await prisma.doctor.findFirst({ where: { id: req.params.id, hospitalId: req.user.hospitalId } });
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });

  const pending = await prisma.creditTransaction.findMany({ where: { doctorId: doctor.id, redeemed: false } });
  if (pending.length === 0) {
    return res.status(400).json({ error: `${doctor.name} has no pending credits to redeem` });
  }

  const { paymentMethod, referenceNumber, remarks } = req.body || {};
  const total = pending.reduce((sum, t) => sum + Number(t.amount), 0);
  const data = { redeemed: true, redeemedAt: new Date(), redeemedByUserId: req.user.id };
  if (paymentMethod) data.paymentMethod = paymentMethod;
  if (referenceNumber) data.referenceNumber = referenceNumber;
  if (remarks) data.remarks = remarks;

  await prisma.creditTransaction.updateMany({
    where: { id: { in: pending.map((t) => t.id) } },
    data,
  });

  res.json({ message: `Redeemed ${total.toFixed(2)} pts across ${pending.length} referral(s) for ${doctor.name}`, total, count: pending.length });
});

export default router;
