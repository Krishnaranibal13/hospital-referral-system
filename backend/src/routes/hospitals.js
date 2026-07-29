import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../utils/prismaClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

const createHospitalSchema = z.object({
  name: z.string().min(1),
  branchName: z.string().optional(),
  address: z.string().optional(),
  adminName: z.string().min(1),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
});

// GET /api/hospitals  (super admin only) — list all hospitals with their staff AND doctors,
// so the super admin has full visibility without needing per-hospital admin access.
router.get("/", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  const hospitals = await prisma.hospital.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      staff: {
        select: { id: true, name: true, email: true, role: true, customRole: { select: { name: true } } },
      },
      doctors: {
        select: { id: true, name: true, phone: true, clinicName: true, active: true, creditAmount: true },
      },
    },
  });
  res.json(
    hospitals.map((h) => ({
      ...h,
      staffCount: h.staff.length,
      doctorCount: h.doctors.length,
    }))
  );
});

// POST /api/hospitals  (super admin only) — create a hospital AND its first admin account together,
// since a hospital with no admin would be a dead end nobody could log into.
router.post("/", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  const parsed = createHospitalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, branchName, address, adminName, adminEmail, adminPassword } = parsed.data;

  const existing = await prisma.staffUser.findUnique({ where: { email: adminEmail } });
  if (existing) {
    return res.status(409).json({ error: "A staff account with this admin email already exists" });
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const hospital = await prisma.hospital.create({
    data: {
      name,
      branchName,
      address,
      staff: {
        create: { name: adminName, email: adminEmail, passwordHash, role: "ADMIN" },
      },
    },
    include: { staff: true },
  });

  res.status(201).json(hospital);
});

// DELETE /api/hospitals/:id  (super admin only)
// Only allowed if the hospital has no doctors yet, to avoid silently orphaning referral history.
router.delete("/:id", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  const doctorCount = await prisma.doctor.count({ where: { hospitalId: req.params.id } });
  if (doctorCount > 0) {
    return res.status(400).json({ error: "Cannot remove a hospital that already has doctors. Deactivate its staff instead." });
  }
  try {
    await prisma.staffUser.deleteMany({ where: { hospitalId: req.params.id } });
    await prisma.hospital.delete({ where: { id: req.params.id } });
    res.json({ message: "Hospital removed" });
  } catch {
    res.status(404).json({ error: "Hospital not found" });
  }
});

// POST /api/hospitals/staff/:staffId/reset-password  (super admin only)
// Lets the super admin unblock any hospital's admin/reception if they're locked out.
router.post("/staff/:staffId/reset-password", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  const target = await prisma.staffUser.findUnique({ where: { id: req.params.staffId } });
  if (!target) return res.status(404).json({ error: "Staff account not found" });

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.staffUser.update({ where: { id: req.params.staffId }, data: { passwordHash } });
  res.json({ message: "Password updated" });
});

// POST /api/hospitals/staff/:staffId/impersonate  (super admin only)
// Issues a normal login session for the target staff account, without needing their
// password, so the super admin can check on / troubleshoot any hospital directly.
router.post("/staff/:staffId/impersonate", requireAuth, requireRole("SUPER_ADMIN"), async (req, res) => {
  const target = await prisma.staffUser.findUnique({
    where: { id: req.params.staffId },
    include: { hospital: true, customRole: true },
  });
  if (!target) return res.status(404).json({ error: "Staff account not found" });

  const permissions = target.role === "STAFF" ? target.customRole?.permissions || [] : [];

  const token = jwt.sign(
    { id: target.id, role: target.role, name: target.name, hospitalId: target.hospitalId, permissions },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({
    token,
    user: {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      hospitalId: target.hospitalId,
      hospitalName: target.hospital?.name || null,
      hospitalBranchName: target.hospital?.branchName || null,
      customRoleName: target.customRole?.name || null,
      permissions,
    },
  });
});

export default router;
