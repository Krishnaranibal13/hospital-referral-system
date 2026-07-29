import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "../utils/prismaClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { PERMISSION_KEYS } from "../utils/permissions.js";

const router = express.Router();

const staffSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "RECEPTION", "STAFF"]),
  // required when role === "STAFF": which custom role defines this account's permissions
  customRoleId: z.string().uuid().optional(),
}).refine((data) => data.role !== "STAFF" || !!data.customRoleId, {
  message: "customRoleId is required when role is STAFF",
  path: ["customRoleId"],
});

const roleSchema = z.object({
  name: z.string().min(1),
  permissions: z.array(z.enum(PERMISSION_KEYS)).min(1, "Select at least one permission"),
});

// ---------- Custom roles (e.g. "Accountant") ----------

// GET /api/staff/roles  (admin only) - list custom roles defined for this hospital,
// including which staff use each one (so admin can see their email / reset password
// directly from the role view without hunting through the full staff list).
router.get("/roles", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const roles = await prisma.customRole.findMany({
    where: { hospitalId: req.user.hospitalId },
    include: { staff: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(roles.map((r) => ({ ...r, staffCount: r.staff.length })));
});

// POST /api/staff/roles  (admin only) - define a new custom role with specific permissions
router.post("/roles", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const role = await prisma.customRole.create({
    data: { ...parsed.data, hospitalId: req.user.hospitalId },
  });
  res.status(201).json(role);
});

// DELETE /api/staff/roles/:id  (admin only) - only if no staff currently use it
// PATCH /api/staff/roles/:id  (admin only) - update an existing role's name/permissions.
// This is how a role like "Accountant" can be granted a new capability (e.g. redeeming
// credits) after the fact, without deleting and recreating it (which would require
// first removing every staff member assigned to it).
router.patch("/roles/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const role = await prisma.customRole.findFirst({ where: { id: req.params.id, hospitalId: req.user.hospitalId } });
  if (!role) return res.status(404).json({ error: "Role not found" });

  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updated = await prisma.customRole.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(updated);
});

router.delete("/roles/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const role = await prisma.customRole.findFirst({
    where: { id: req.params.id, hospitalId: req.user.hospitalId },
    include: { _count: { select: { staff: true } } },
  });
  if (!role) return res.status(404).json({ error: "Role not found" });
  if (role._count.staff > 0) {
    return res.status(400).json({ error: "Reassign or remove staff using this role before deleting it" });
  }
  await prisma.customRole.delete({ where: { id: req.params.id } });
  res.json({ message: "Role removed" });
});

// ---------- Staff accounts ----------

// GET /api/staff  (admin only) - list staff within the admin's own hospital
router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const staff = await prisma.staffUser.findMany({
    where: { hospitalId: req.user.hospitalId },
    select: { id: true, name: true, email: true, role: true, createdAt: true, customRole: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(staff);
});

// POST /api/staff  (admin only) - create a new staff account within the admin's own hospital
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = staffSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, email, password, role, customRoleId } = parsed.data;

  const existing = await prisma.staffUser.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "A staff account with this email already exists" });
  }

  if (role === "STAFF") {
    const customRole = await prisma.customRole.findFirst({ where: { id: customRoleId, hospitalId: req.user.hospitalId } });
    if (!customRole) return res.status(400).json({ error: "That custom role does not exist for this hospital" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.staffUser.create({
    data: {
      name, email, passwordHash, role,
      hospitalId: req.user.hospitalId,
      customRoleId: role === "STAFF" ? customRoleId : null,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true, customRole: { select: { id: true, name: true } } },
  });

  res.status(201).json(user);
});

// POST /api/staff/:id/reset-password  (admin only) - own hospital's staff only
router.post("/:id/reset-password", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const target = await prisma.staffUser.findFirst({ where: { id: req.params.id, hospitalId: req.user.hospitalId } });
  if (!target) return res.status(404).json({ error: "Staff account not found" });

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.staffUser.update({ where: { id: req.params.id }, data: { passwordHash } });
  res.json({ message: "Password updated" });
});

// DELETE /api/staff/:id  (admin only) - own hospital's staff only
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  const target = await prisma.staffUser.findFirst({ where: { id: req.params.id, hospitalId: req.user.hospitalId } });
  if (!target) return res.status(404).json({ error: "Staff account not found" });

  await prisma.staffUser.delete({ where: { id: req.params.id } });
  res.json({ message: "Staff account removed" });
});

export default router;
