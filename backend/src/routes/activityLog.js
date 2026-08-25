import express from "express";
import prisma from "../utils/prismaClient.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ACTIONS } from "../utils/activityLog.js";

const router = express.Router();
const PAGE_SIZE = 50;

// GET /api/activity-log  (admin only) — paginated, filterable audit trail for this hospital.
// Query params (all optional): entityType, action, actorUserId, from, to, page.
router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { entityType, action, actorUserId, from, to } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  const where = { hospitalId: req.user.hospitalId };
  if (entityType) where.entityType = entityType;
  if (action) where.action = action;
  if (actorUserId) where.actorUserId = actorUserId;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  const [total, entries] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  res.json({ entries, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
});

// GET /api/activity-log/filters  (admin only) — distinct entity types, actions, and actors
// actually present in this hospital's log, so the filter dropdowns only show options that
// will return results, and stay in sync as new action types get logged over time.
router.get("/filters", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const [entityTypes, actorRows] = await Promise.all([
    prisma.activityLog.findMany({ where: { hospitalId }, distinct: ["entityType"], select: { entityType: true } }),
    prisma.activityLog.findMany({
      where: { hospitalId, actorUserId: { not: null } },
      distinct: ["actorUserId"],
      select: { actorUserId: true, actorName: true },
      orderBy: { actorName: "asc" },
    }),
  ]);

  res.json({
    entityTypes: entityTypes.map((e) => e.entityType).sort(),
    actions: Object.values(ACTIONS).sort(),
    actors: actorRows.map((a) => ({ id: a.actorUserId, name: a.actorName })),
  });
});

export default router;
