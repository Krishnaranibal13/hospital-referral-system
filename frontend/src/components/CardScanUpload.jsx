import { useRef, useState } from "react";
import { ScanLine, Loader2, AlertTriangle } from "lucide-react";
import api from "../api/client";

const CARD_TYPES = [
  { value: "AADHAAR", label: "Aadhaar card" },
  { value: "AYUSHMAN", label: "Ayushman Bharat card" },
  { value: "CGHS", label: "CGHS card" },
  { value: "ECHS", label: "ECHS card" },
  { value: "CAPF", label: "CAPF card" },
];

// The OCR provider's free tier caps uploads at 1MB, but phone camera photos routinely come
// in at 2-8MB — so every photo gets resized/recompressed in the browser before upload. This
// also means less mobile data used and a faster upload for the person scanning the card.
const MAX_UPLOAD_BYTES = 950 * 1024; // a little under 1MB for safety margin
const MAX_DIMENSION = 1600; // plenty for OCR on printed card text; no need for the original's full resolution

async function compressImage(file) {
  if (!file.type.startsWith("image/")) return file; // not an image somehow — let the backend reject it

  // createImageBitmap with imageOrientation "from-image" respects the photo's EXIF rotation
  // tag (how phone cameras normally record "this was held sideways"), so the compressed
  // output comes out right-side-up the same way the original photo previewed on the phone.
  // It does NOT fix a card photographed sideways within an otherwise upright frame — that's
  // a framing issue, not an EXIF one, and can't be corrected automatically here.
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // very old browser without EXIF-aware decoding — fall back to the original
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  // Step quality down until the file fits the size cap, or we hit a quality floor.
  let quality = 0.9;
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  while (blob && blob.size > MAX_UPLOAD_BYTES && quality > 0.3) {
    quality -= 0.15;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }
  return blob || file;
}

// Lets someone upload/photograph an ID or health-scheme card and have the name/age/gender
// (and, for scheme cards, the billing panel) prefilled automatically via OCR, instead of
// typing them in by hand. Works two ways:
//   - Pass `doctorCode` for the public leader-facing referral form (no login).
//   - Omit it when used inside an already-authenticated screen (e.g. Add Patient) — the
//     shared axios client attaches the staff auth token automatically.
// Extracted fields are always handed back for the person to review/edit, never auto-applied
// silently — a card photo OCR read is a starting point, not a guarantee.
export default function CardScanUpload({ doctorCode, onExtracted }) {
  const [cardType, setCardType] = useState("AADHAAR");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;

    setScanning(true);
    setError("");
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed, "card.jpg");
      formData.append("cardType", cardType);
      if (doctorCode) formData.append("doctorCode", doctorCode);

      const { data } = await api.post("/ocr/extract-card", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onExtracted(data);
    } catch (err) {
      setError(err?.response?.data?.error || "Could not read this card. Please enter the details manually.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFile}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <select value={cardType} onChange={(e) => setCardType(e.target.value)} style={{ flex: 1 }} disabled={scanning}>
          {CARD_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button
          type="button"
          className="secondary"
          style={{ width: "auto", padding: "8px 16px", whiteSpace: "nowrap" }}
          disabled={scanning}
          onClick={() => fileInputRef.current?.click()}
        >
          {scanning ? <Loader2 size={15} className="spin" /> : <ScanLine size={15} />}
          {scanning ? "Reading…" : "Scan card"}
        </button>
      </div>
      {error && (
        <p style={{ fontSize: 12.5, color: "var(--red-700)", marginTop: 6, display: "flex", alignItems: "flex-start", gap: 4 }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />{error}
        </p>
      )}
      <p style={{ fontSize: 11.5, color: "var(--ink-soft)", marginTop: 6 }}>
        We'll fill in what we can read — please check it's correct before submitting.
      </p>
    </div>
  );
}
