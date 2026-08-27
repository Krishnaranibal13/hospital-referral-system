import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import prisma from "../utils/prismaClient.js";
import { optionalAuth } from "../middleware/auth.js";
import { extractFromCardImage, CARD_TYPES } from "../utils/ocrProvider.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// OCR calls cost money per request (Surepass bills per call), so the public path gets its
// own tighter limit than the general public referral-submit endpoint.
const ocrLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many card scans from this device. Please wait a bit, or enter the details manually." },
});

// POST /api/ocr/extract-card — reads a photo of an ID or health-scheme card (Aadhaar,
// Ayushman/PM-JAY, CGHS, ECHS, or CAPF) and returns the patient's name/age/gender — plus,
// for the scheme cards, the panel that referral should be billed against — to prefill a
// form. Reachable two ways:
//   - Logged-in staff (any role) — used by the admin/reception "Add patient" modal.
//   - Public, via a valid doctorCode — used by a leader's own referral submission page,
//     mirroring how the public referral-submit endpoint itself is authorized.
// Either way, the result is meant to prefill editable fields, never to auto-submit — OCR on a
// photographed card is never 100% reliable, so a human always confirms before it's saved.
router.post("/extract-card", ocrLimiter, optionalAuth, upload.single("file"), async (req, res) => {
  const { cardType, doctorCode } = req.body || {};
  if (!CARD_TYPES.includes(cardType)) {
    return res.status(400).json({ error: `cardType must be one of ${CARD_TYPES.join(", ")}` });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded" });
  }

  if (!req.user) {
    if (!doctorCode) return res.status(401).json({ error: "Not authenticated" });
    const doctor = await prisma.doctor.findUnique({ where: { uniqueCode: doctorCode } });
    if (!doctor || !doctor.active) {
      return res.status(404).json({ error: "This referral link is not valid or is no longer active" });
    }
  }

  try {
    const result = await extractFromCardImage({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      cardType,
    });
    res.json(result);
  } catch (err) {
    console.error("OCR extraction failed:", err.message);
    res.status(502).json({ error: "Could not read this card automatically. Please enter the details manually." });
  }
});

export default router;
