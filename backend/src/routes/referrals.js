import express from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import prisma from "../utils/prismaClient.js";
import { requireAuth, requireRole, requireAccess } from "../middleware/auth.js";
import { startOfIstDay } from "../utils/istDate.js";
import { formatDate, formatDateTime } from "../utils/formatDate.js";

const router = express.Router();

// Prevent abuse of the public, unauthenticated referral-submission endpoint
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many submissions from this device. Please try again later." },
});

const referralSchema = z.object({
  doctorCode: z.string().uuid(),
  patientName: z.string().min(1),
  patientAge: z.number().int().positive().max(130),
  patientPhone: z.string().optional(),
  patientGender: z.enum(["MALE", "FEMALE", "OTHER"]),
  scanLatitude: z.number().optional(),
  scanLongitude: z.number().optional(),
  scanAccuracyM: z.number().optional(),
});

// Reverse-geocode lat/long into a human readable address using OpenStreetMap Nominatim.
// Best-effort only: if it fails, we still keep the raw coordinates.
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      { headers: { "User-Agent": "hospital-referral-system/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

// Shared filter builder used by the list view and both export endpoints, so exports
// always match whatever the admin currently has filtered/searched for on screen.
function buildWhere(req) {
  const { search, status, doctorId, range } = req.query;
  const where = { doctor: { hospitalId: req.user.hospitalId } };
  if (status) where.status = status;
  if (doctorId) where.doctorId = doctorId;
  if (search) {
    where.OR = [
      { patientName: { contains: search } },
      { patientPhone: { contains: search } },
    ];
  }
  if (range && range !== "all") {
    const now = new Date();
    let from = null;
    if (range === "today") from = startOfIstDay(0);
    else if (range === "7d") from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (range === "30d") from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    else if (range === "90d") from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    if (from) where.createdAt = { gte: from };
  }
  return where;
}

// POST /api/referrals  (public - no auth, this is what the QR code links to)
router.post("/", publicLimiter, async (req, res) => {
  const parsed = referralSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { doctorCode, patientName, patientAge, patientPhone, patientGender, scanLatitude, scanLongitude, scanAccuracyM } =
    parsed.data;

  const doctor = await prisma.doctor.findUnique({ where: { uniqueCode: doctorCode } });
  if (!doctor || !doctor.active) {
    return res.status(404).json({ error: "This referral link is not valid or is no longer active" });
  }

  let scanAddress = null;
  if (scanLatitude != null && scanLongitude != null) {
    scanAddress = await reverseGeocode(scanLatitude, scanLongitude);
  }

  const referral = await prisma.referral.create({
    data: {
      doctorId: doctor.id,
      patientName,
      patientAge,
      patientPhone,
      patientGender,
      scanLatitude,
      scanLongitude,
      scanAccuracyM,
      scanAddress,
    },
  });

  res.status(201).json({ message: "Referral submitted successfully", referralId: referral.id });
});

// GET /api/referrals?search=name_or_phone&status=PENDING  (reception + admin)
// Scoped to the logged-in staff member's own hospital, via each referral's doctor.
router.get("/", requireAuth, requireAccess(["ADMIN", "RECEPTION"], ["VIEW_REFERRALS", "MANAGE_REFERRALS"]), async (req, res) => {
  const referrals = await prisma.referral.findMany({
    where: buildWhere(req),
    include: {
      doctor: { select: { name: true, clinicName: true, phone: true, creditAmount: true } },
      transaction: { select: { id: true, amount: true, redeemed: true, redeemedAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  res.json(referrals);
});

// GET /api/referrals/export/excel  (admin) — respects the same search/status filters as the list view
router.get("/export/excel", requireAuth, requireAccess(["ADMIN"], ["EXPORT_REPORTS"]), async (req, res) => {
  const referrals = await prisma.referral.findMany({
    where: buildWhere(req),
    include: { doctor: true, transaction: true },
    orderBy: [{ doctor: { name: "asc" } }, { createdAt: "asc" }],
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Referrals");
  sheet.columns = [
    { header: "Patient Name", key: "patientName", width: 22 },
    { header: "Age", key: "patientAge", width: 8 },
    { header: "Gender", key: "patientGender", width: 10 },
    { header: "Phone", key: "patientPhone", width: 16 },
    { header: "Referred By", key: "doctorName", width: 22 },
    { header: "Clinic", key: "clinicName", width: 22 },
    { header: "Status", key: "status", width: 12 },
    { header: "Credit Amount (₹)", key: "creditAmount", width: 16 },
    { header: "Location", key: "location", width: 40 },
    { header: "Submitted At", key: "createdAt", width: 20 },
    { header: "Resolved At", key: "arrivedAt", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of referrals) {
    sheet.addRow({
      patientName: r.patientName,
      patientAge: r.patientAge,
      patientGender: r.patientGender || "",
      patientPhone: r.patientPhone || "",
      doctorName: r.doctor.name,
      clinicName: r.doctor.clinicName || "",
      status: r.status,
      creditAmount: r.transaction ? Number(r.transaction.amount) : "",
      location: r.scanAddress || (r.scanLatitude != null ? `${r.scanLatitude}, ${r.scanLongitude}` : ""),
      createdAt: formatDateTime(r.createdAt),
      arrivedAt: r.arrivedAt ? formatDateTime(r.arrivedAt) : "",
    });
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=referrals.xlsx");
  await workbook.xlsx.write(res);
  res.end();
});

// GET /api/referrals/export/pdf  (admin) — same filters, proper column-aligned table
router.get("/export/pdf", requireAuth, requireAccess(["ADMIN"], ["EXPORT_REPORTS"]), async (req, res) => {
  const referrals = await prisma.referral.findMany({
    where: buildWhere(req),
    include: { doctor: true, transaction: true },
    orderBy: [{ doctor: { name: "asc" } }, { createdAt: "asc" }],
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=referrals.pdf");

  const doc = new PDFDocument({ margin: 36, size: "A4", layout: "landscape" });
  doc.pipe(res);

  const startX = doc.page.margins.left;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  // PDFKit's standard fonts (Helvetica) don't include the ₹ glyph — it renders as a
  // broken superscript character. "Rs" avoids that entirely in the exported file.
  const columns = [
    { key: "num", label: "#", width: 22 },
    { key: "patient", label: "Patient", width: 110 },
    { key: "gender", label: "Gender", width: 55 },
    { key: "age", label: "Age", width: 32 },
    { key: "status", label: "Status", width: 65 },
    { key: "credit", label: "Credit", width: 55 },
    { key: "date", label: "Date", width: 55 },
    { key: "location", label: "Location", width: 280 },
  ];
  const tableWidth = columns.reduce((s, c) => s + c.width, 0);

  function drawColumnHeader(y) {
    let x = startX;
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#252e69");
    columns.forEach((c) => { doc.text(c.label, x, y, { width: c.width }); x += c.width; });
    doc.moveTo(startX, y + 13).lineTo(startX + tableWidth, y + 13).strokeColor("#d0d5dd").stroke();
    doc.font("Helvetica").fillColor("#101733");
    return y + 18;
  }

  doc.fontSize(16).font("Helvetica-Bold").text("Referral Report", { align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor("#667085").text(`Generated ${formatDateTime(new Date())}`, { align: "center" });
  doc.fillColor("#101733");
  let y = doc.y + 14;

  let lastDoctorId = null;
  let itemNumber = 0;

  referrals.forEach((r) => {
    if (r.doctorId !== lastDoctorId) {
      lastDoctorId = r.doctorId;
      itemNumber = 0;
      if (y > doc.page.margins.top + 20) y += 10;
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#178a9a").text(`${r.doctor.name}${r.doctor.clinicName ? ` — ${r.doctor.clinicName}` : ""}`, startX, y);
      doc.font("Helvetica").fillColor("#101733");
      y += 18;
      y = drawColumnHeader(y);
    }

    itemNumber += 1;
    const credit = r.transaction ? `Rs ${Number(r.transaction.amount).toFixed(2)}` : "-";
    let location = r.scanAddress || (r.scanLatitude != null ? `${r.scanLatitude.toFixed(4)}, ${r.scanLongitude.toFixed(4)}` : "Not shared");
    if (location.length > 55) location = location.slice(0, 52) + "...";

    const rowValues = [itemNumber, r.patientName, r.patientGender || "-", r.patientAge, r.status, credit, formatDate(r.createdAt), location];
    let x = startX;
    doc.fontSize(9);
    columns.forEach((c, i) => { doc.text(String(rowValues[i]), x, y, { width: c.width }); x += c.width; });
    y += 16;

    if (y > pageBottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawColumnHeader(y);
    }
  });

  if (referrals.length === 0) {
    doc.text("No referrals match the current filters.", startX, y);
  }

  doc.end();
});

// POST /api/referrals/:id/arrive  (reception + admin) - confirm patient match, credit the doctor.
// Accepts an optional `amount` to override the doctor's default per-referral credit for
// this specific case (e.g. a bonus for an especially valuable referral).
router.post("/:id/arrive", requireAuth, requireAccess(["ADMIN", "RECEPTION"], ["MANAGE_REFERRALS"]), async (req, res) => {
  const referral = await prisma.referral.findFirst({
    where: { id: req.params.id, doctor: { hospitalId: req.user.hospitalId } },
    include: { doctor: true },
  });
  if (!referral) return res.status(404).json({ error: "Referral not found" });
  if (referral.status !== "PENDING") {
    return res.status(400).json({ error: `Referral is already ${referral.status.toLowerCase()}` });
  }

  let amount = referral.doctor.creditAmount;
  if (req.body?.amount !== undefined) {
    const parsedAmount = Number(req.body.amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: "Credit amount must be a non-negative number" });
    }
    amount = parsedAmount;
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.referral.update({
      where: { id: referral.id },
      data: {
        status: "CREDITED",
        arrivedAt: new Date(),
        matchedByUserId: req.user.id,
      },
    });

    const transaction = await tx.creditTransaction.create({
      data: {
        doctorId: referral.doctorId,
        referralId: referral.id,
        amount,
        note: `Confirmed by ${req.user.name}${Number(amount) !== Number(referral.doctor.creditAmount) ? " (custom amount)" : ""}`,
      },
    });

    return { updated, transaction };
  });

  res.json(result);
});

// POST /api/referrals/:id/reject  (reception + admin) - not a valid match
router.post("/:id/reject", requireAuth, requireAccess(["ADMIN", "RECEPTION"], ["MANAGE_REFERRALS"]), async (req, res) => {
  const { reason } = req.body;
  const referral = await prisma.referral.findFirst({
    where: { id: req.params.id, doctor: { hospitalId: req.user.hospitalId } },
  });
  if (!referral) return res.status(404).json({ error: "Referral not found" });

  const updated = await prisma.referral.update({
    where: { id: req.params.id },
    data: { status: "REJECTED", rejectedReason: reason || "No reason given" },
  });
  res.json(updated);
});

// POST /api/referrals/:id/redeem  (admin, or STAFF with REDEEM_CREDITS) — mark this
// referral's credit as paid out to the doctor. This is distinct from "confirming
// arrival": confirming creates the credit (owed but unpaid); redeeming marks it paid.
router.post("/:id/redeem", requireAuth, requireAccess(["ADMIN"], ["REDEEM_CREDITS"]), async (req, res) => {
  const referral = await prisma.referral.findFirst({
    where: { id: req.params.id, doctor: { hospitalId: req.user.hospitalId } },
    include: { transaction: true },
  });
  if (!referral) return res.status(404).json({ error: "Referral not found" });
  if (!referral.transaction) return res.status(400).json({ error: "This referral has no credit to redeem" });
  if (referral.transaction.redeemed) return res.status(400).json({ error: "This credit has already been redeemed" });

  const { paymentMethod, referenceNumber, remarks, amount } = req.body || {};
  const data = { redeemed: true, redeemedAt: new Date(), redeemedByUserId: req.user.id };
  if (paymentMethod) data.paymentMethod = paymentMethod;
  if (referenceNumber) data.referenceNumber = referenceNumber;
  if (remarks) data.remarks = remarks;
  if (amount !== undefined) {
    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: "Amount must be a non-negative number" });
    }
    data.amount = parsedAmount;
  }

  const updated = await prisma.creditTransaction.update({
    where: { id: referral.transaction.id },
    data,
  });
  res.json(updated);
});

export default router;
