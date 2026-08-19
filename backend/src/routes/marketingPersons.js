import express from "express";
import { z } from "zod";
import prisma from "../utils/prismaClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { startOfIstDay, istDateString } from "../utils/istDate.js";

const router = express.Router();

const marketingPersonSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

// GET /api/marketing-persons  (admin) — every marketing-team member for this hospital,
// with how many leaders they're associated with and how many leads those leaders have
// brought in, mirroring the stats shown on the Leaders tab.
router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const people = await prisma.marketingPerson.findMany({
    where: { hospitalId: req.user.hospitalId },
    orderBy: { createdAt: "desc" },
    include: {
      doctors: {
        select: {
          id: true,
          transactions: { select: { amount: true, redeemed: true } },
          _count: { select: { referrals: true } },
          referrals: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  const result = people.map((p) => {
    const allTx = p.doctors.flatMap((d) => d.transactions);
    const lastReferralAt = p.doctors.reduce((latest, d) => {
      const dLatest = d.referrals[0]?.createdAt || null;
      if (!dLatest) return latest;
      return !latest || dLatest > latest ? dLatest : latest;
    }, null);
    return {
      id: p.id,
      name: p.name,
      phone: p.phone,
      email: p.email,
      active: p.active,
      createdAt: p.createdAt,
      leaderCount: p.doctors.length,
      totalReferrals: p.doctors.reduce((sum, d) => sum + d._count.referrals, 0),
      totalCredited: allTx.reduce((sum, t) => sum + Number(t.amount), 0),
      totalPending: allTx.filter((t) => !t.redeemed).reduce((sum, t) => sum + Number(t.amount), 0),
      lastReferralAt,
    };
  });

  res.json(result);
});

// GET /api/marketing-persons/lite  — minimal list for the leader edit/create dropdown.
router.get("/lite", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const people = await prisma.marketingPerson.findMany({
    where: { hospitalId: req.user.hospitalId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  res.json(people);
});

// GET /api/marketing-persons/:id  (admin) — detail view: every leader under this person,
// plus weekly (last 8 weeks) and monthly (last 6 months) referral counts and credited
// amounts, so admin can see trend over time, not just a lifetime total.
router.get("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const person = await prisma.marketingPerson.findFirst({
    where: { id: req.params.id, hospitalId: req.user.hospitalId },
  });
  if (!person) return res.status(404).json({ error: "Marketing person not found" });

  const doctors = await prisma.doctor.findMany({
    where: { marketingPersonId: person.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { referrals: true } },
      transactions: { select: { amount: true, redeemed: true } },
    },
  });

  const leaders = doctors.map((d) => ({
    id: d.id,
    name: d.name,
    clinicName: d.clinicName,
    active: d.active,
    totalReferrals: d._count.referrals,
    totalCredited: d.transactions.reduce((sum, t) => sum + Number(t.amount), 0),
  }));

  const doctorIds = doctors.map((d) => d.id);
  const referrals = doctorIds.length
    ? await prisma.referral.findMany({
        where: { doctorId: { in: doctorIds } },
        select: { createdAt: true, transaction: { select: { amount: true } } },
      })
    : [];

  // Weekly buckets: last 8 weeks, Monday-start, labeled by the week's start date.
  const weekly = [];
  for (let w = 7; w >= 0; w--) {
    const end = startOfIstDay(w * 7);
    const start = startOfIstDay(w * 7 + 7);
    const inWeek = referrals.filter((r) => r.createdAt >= start && r.createdAt < end);
    weekly.push({
      weekStart: istDateString(start),
      count: inWeek.length,
      credited: inWeek.reduce((sum, r) => sum + (r.transaction ? Number(r.transaction.amount) : 0), 0),
    });
  }

  // Monthly buckets: last 6 calendar months (IST), most recent last.
  const monthly = [];
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // shift to IST wall-clock
  for (let m = 5; m >= 0; m--) {
    const bucketDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    const y = bucketDate.getUTCFullYear();
    const mo = bucketDate.getUTCMonth();
    const label = bucketDate.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    const inMonth = referrals.filter((r) => {
      const shifted = new Date(r.createdAt.getTime() + 5.5 * 60 * 60 * 1000);
      return shifted.getUTCFullYear() === y && shifted.getUTCMonth() === mo;
    });
    monthly.push({
      month: label,
      count: inMonth.length,
      credited: inMonth.reduce((sum, r) => sum + (r.transaction ? Number(r.transaction.amount) : 0), 0),
    });
  }

  res.json({
    person: { id: person.id, name: person.name, phone: person.phone, email: person.email, active: person.active },
    leaders,
    totalReferrals: referrals.length,
    totalCredited: referrals.reduce((sum, r) => sum + (r.transaction ? Number(r.transaction.amount) : 0), 0),
    weekly,
    monthly,
  });
});

// POST /api/marketing-persons  (admin) — add a new marketing-team member.
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = marketingPersonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const person = await prisma.marketingPerson.create({
    data: { ...parsed.data, hospitalId: req.user.hospitalId },
  });
  res.status(201).json(person);
});

// PATCH /api/marketing-persons/:id  (admin) — edit details or toggle active.
router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const allowed = ["name", "phone", "email", "active"];
  const data = {};
  for (const key of allowed) {
    if (key in req.body) data[key] = req.body[key];
  }

  const existing = await prisma.marketingPerson.findFirst({ where: { id: req.params.id, hospitalId: req.user.hospitalId } });
  if (!existing) return res.status(404).json({ error: "Marketing person not found" });

  const person = await prisma.marketingPerson.update({ where: { id: req.params.id }, data });
  res.json(person);
});

export default router;
