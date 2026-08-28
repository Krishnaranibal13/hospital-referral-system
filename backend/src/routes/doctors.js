import express from "express";
import QRCode from "qrcode";
import ExcelJS from "exceljs";
import multer from "multer";
import { z } from "zod";
import prisma from "../utils/prismaClient.js";
import { requireAuth, requireRole, requireAccess } from "../middleware/auth.js";
import { logActivity, diffFields, ACTIONS } from "../utils/activityLog.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const doctorSchema = z.object({
  name: z.string().min(1),
  specialty: z.string().optional(),
  phone: z.string().min(5),
  email: z.string().email().optional().or(z.literal("")),
  clinicName: z.string().optional(),
  city: z.string().optional(),
  marketingPersonId: z.string().uuid().optional().or(z.literal("")),
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
    data: { ...parsed.data, marketingPersonId: parsed.data.marketingPersonId || null, hospitalId: req.user.hospitalId },
  });

  logActivity({
    actor: req.user,
    action: ACTIONS.DOCTOR_CREATED,
    entityType: "Doctor",
    entityId: doctor.id,
    entityLabel: doctor.name,
  });

  const referralUrl = `${process.env.FRONTEND_URL}/refer/${doctor.uniqueCode}`;
  const dashboardUrl = `${process.env.FRONTEND_URL}/doctor/${doctor.uniqueCode}`;
  const qrDataUrl = await QRCode.toDataURL(referralUrl);

  res.status(201).json({ doctor, referralUrl, dashboardUrl, qrDataUrl });
});

// GET /api/doctors/bulk-import/template  (admin) - downloadable Excel template with the
// exact columns the bulk-import endpoint below expects, plus example rows.
router.get("/bulk-import/template", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leaders");
  sheet.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Specialty", key: "specialty", width: 22 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Clinic Name", key: "clinicName", width: 24 },
    { header: "City", key: "city", width: 18 },
    { header: "Marketing Person", key: "marketingPersonName", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({ name: "Dr. Anita Sharma", specialty: "Ophthalmologist", phone: "9876543210", clinicName: "Sharma Eye Clinic", city: "Greater Noida", marketingPersonName: "Rohit Verma" });
  sheet.addRow({ name: "Ramesh Kumar", specialty: "Ambulance Staff", phone: "9876500000", clinicName: "", city: "Greater Noida", marketingPersonName: "" });
  sheet.addRow({ name: "Suresh Yadav", specialty: "Village Pradhan", phone: "9876511111", clinicName: "", city: "Dadri", marketingPersonName: "" });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=leader-bulk-import-template.xlsx");
  await workbook.xlsx.write(res);
  res.end();
});

// POST /api/doctors/bulk-import  (admin) - create many leader profiles at once from an
// uploaded Excel file. Columns are matched by header name, case-insensitively, and can be
// in any order — only "Name" and a phone column are required; everything else is optional.
// Does not generate QR codes here (500 rows would mean 500 QR images) — QR codes are
// generated on demand per leader from "View QR" in the list, same as a normal single create.
router.post("/bulk-import", requireAuth, requireRole("ADMIN"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file.buffer);
  } catch {
    return res.status(400).json({ error: "Could not read this file. Make sure it's a valid .xlsx file." });
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    return res.status(400).json({ error: "The uploaded sheet has no data rows." });
  }

  // Map header row -> column number, case-insensitively and tolerant of common variations.
  const colIndex = {};
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const key = String(cell.value || "").trim().toLowerCase();
    if (key) colIndex[key] = colNumber;
  });
  const findCol = (...names) => names.map((n) => colIndex[n]).find((v) => v !== undefined) ?? null;

  const nameCol = findCol("name");
  const specialtyCol = findCol("specialty", "speciality", "role");
  const phoneCol = findCol("phone", "mobile", "mobile number", "mob number", "mob no", "phone number");
  const clinicCol = findCol("clinic name", "clinic");
  const cityCol = findCol("city");
  const marketingPersonCol = findCol("marketing person", "marketing person name", "through", "associated with");

  if (!nameCol || !phoneCol) {
    return res.status(400).json({
      error: "The sheet must have at least a 'Name' column and a 'Phone' (or 'Mob Number') column in the first row.",
    });
  }

  const created = [];
  const skipped = [];
  const getCell = (row, col) => (col ? String(row.getCell(col).value ?? "").trim() : "");

  // Cache marketing persons by lowercased name so repeat names across rows don't
  // re-query/re-create — same pattern used for leader auto-creation in the referral import.
  const existingMarketingPersons = await prisma.marketingPerson.findMany({ where: { hospitalId: req.user.hospitalId } });
  const marketingPersonCache = new Map(existingMarketingPersons.map((m) => [m.name.trim().toLowerCase(), m]));

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const name = getCell(row, nameCol);
    const phone = getCell(row, phoneCol);

    if (!name && !phone) continue; // silently skip fully blank rows (common at the end of a sheet)

    if (!name || !phone) {
      skipped.push({ row: rowNumber, reason: !name ? "Missing name" : "Missing phone number" });
      continue;
    }

    try {
      const marketingPersonText = getCell(row, marketingPersonCol);
      let marketingPersonId = null;
      if (marketingPersonText) {
        const key = marketingPersonText.toLowerCase();
        let mp = marketingPersonCache.get(key);
        if (!mp) {
          mp = await prisma.marketingPerson.create({ data: { name: marketingPersonText, hospitalId: req.user.hospitalId } });
          marketingPersonCache.set(key, mp);
        }
        marketingPersonId = mp.id;
      }

      const doctor = await prisma.doctor.create({
        data: {
          name,
          phone,
          specialty: getCell(row, specialtyCol) || null,
          clinicName: getCell(row, clinicCol) || null,
          city: getCell(row, cityCol) || null,
          marketingPersonId,
          hospitalId: req.user.hospitalId,
        },
      });
      created.push({ row: rowNumber, id: doctor.id, name: doctor.name });
    } catch {
      skipped.push({ row: rowNumber, reason: "Could not save this row due to an unexpected error" });
    }
  }

  if (created.length > 0) {
    logActivity({
      actor: req.user,
      action: ACTIONS.DOCTOR_BULK_IMPORTED,
      entityType: "Doctor",
      entityLabel: req.file.originalname || "Bulk import",
      metadata: { createdCount: created.length, skippedCount: skipped.length },
    });
  }

  res.json({ createdCount: created.length, skippedCount: skipped.length, skipped });
});

// GET /api/doctors  (admin) - list doctors within the admin's own hospital only
// Windows offered by the leader comparison table's period columns/sort — matches the
// marketing-employee comparison table exactly for consistency.
const COMPARISON_PERIODS = { week: 7, fortnight: 14, month: 30, "3months": 90, "6months": 180 };
const COMPARISON_PAGE_SIZE = 25;

function withinPeriod(date, days) {
  return new Date(date).getTime() >= Date.now() - days * 24 * 60 * 60 * 1000;
}

// GET /api/doctors/comparison  (admin only) — leads + credit points per leader, across 5
// fixed time windows, for the Leaders tab's "Compare" view. Built to stay fast as the leader
// count grows into the thousands: search/sort/pagination all happen server-side, so the
// frontend only ever receives one page (25 rows) no matter how many leaders exist. The one
// unavoidable per-request cost is a single pass over this hospital's referrals to bucket them
// by period — that cost scales with referral volume, not leader count, and only runs when an
// admin actually opens this view (it's not part of the main dashboard load).
router.get("/comparison", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const hospitalId = req.user.hospitalId;
  const { search } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const sortPeriod = Object.keys(COMPARISON_PERIODS).includes(req.query.sortPeriod) ? req.query.sortPeriod : "month";
  const sortDir = req.query.sortDir === "asc" ? "asc" : "desc";

  const doctorWhere = { hospitalId };
  if (search) doctorWhere.name = { contains: search };

  const [doctors, referrals, transactions] = await Promise.all([
    prisma.doctor.findMany({ where: doctorWhere, select: { id: true, name: true, clinicName: true } }),
    prisma.referral.findMany({ where: { doctor: { hospitalId } }, select: { id: true, doctorId: true, createdAt: true } }),
    prisma.creditTransaction.findMany({ where: { doctor: { hospitalId } }, select: { referralId: true, amount: true } }),
  ]);

  const amountByReferralId = new Map(transactions.map((t) => [t.referralId, Number(t.amount)]));
  const byDoctor = new Map(
    doctors.map((d) => [
      d.id,
      { id: d.id, name: d.name, clinicName: d.clinicName, byPeriod: Object.fromEntries(Object.keys(COMPARISON_PERIODS).map((k) => [k, { leadsCount: 0, amount: 0 }])) },
    ])
  );
  for (const r of referrals) {
    const row = byDoctor.get(r.doctorId);
    if (!row) continue; // filtered out by search, or a different hospital's row somehow — skip
    const amount = amountByReferralId.get(r.id) || 0;
    for (const [key, days] of Object.entries(COMPARISON_PERIODS)) {
      if (withinPeriod(r.createdAt, days)) {
        row.byPeriod[key].leadsCount += 1;
        row.byPeriod[key].amount += amount;
      }
    }
  }

  const rows = Array.from(byDoctor.values()).sort((a, b) => {
    const diff = a.byPeriod[sortPeriod].leadsCount - b.byPeriod[sortPeriod].leadsCount;
    return sortDir === "asc" ? diff : -diff;
  });

  const total = rows.length;
  const paged = rows.slice((page - 1) * COMPARISON_PAGE_SIZE, page * COMPARISON_PAGE_SIZE);

  res.json({ rows: paged, total, page, pageSize: COMPARISON_PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / COMPARISON_PAGE_SIZE)) });
});

router.get("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const doctors = await prisma.doctor.findMany({
    where: { hospitalId: req.user.hospitalId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { referrals: true } },
      transactions: { select: { amount: true, redeemed: true } },
      referrals: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      marketingPerson: { select: { id: true, name: true } },
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
  const allowed = ["name", "specialty", "phone", "email", "clinicName", "city", "marketingPersonId", "creditAmount", "active"];
  const data = {};
  for (const key of allowed) {
    if (key in req.body) data[key] = req.body[key];
  }
  if ("marketingPersonId" in data && !data.marketingPersonId) data.marketingPersonId = null;

  const existing = await prisma.doctor.findFirst({ where: { id: req.params.id, hospitalId: req.user.hospitalId } });
  if (!existing) return res.status(404).json({ error: "Doctor not found" });

  const doctor = await prisma.doctor.update({ where: { id: req.params.id }, data });

  logActivity({
    actor: req.user,
    action: ACTIONS.DOCTOR_UPDATED,
    entityType: "Doctor",
    entityId: doctor.id,
    entityLabel: doctor.name,
    changes: diffFields(existing, doctor, allowed),
  });

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

  logActivity({
    actor: req.user,
    action: ACTIONS.CREDIT_REDEEMED_ALL,
    entityType: "Doctor",
    entityId: doctor.id,
    entityLabel: doctor.name,
    metadata: {
      total,
      count: pending.length,
      paymentMethod: paymentMethod || null,
      referenceNumber: referenceNumber || null,
      remarks: remarks || null,
    },
  });

  res.json({ message: `Redeemed ${total.toFixed(2)} pts across ${pending.length} referral(s) for ${doctor.name}`, total, count: pending.length });
});

export default router;
