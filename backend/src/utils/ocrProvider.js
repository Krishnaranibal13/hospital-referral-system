// Wraps the OCR.space API to pull patient details off a photo of an identity or government
// health-scheme card, so a leader or reception don't have to type them in by hand.
// Supported card types: AADHAAR, AYUSHMAN, CGHS, ECHS, CAPF.
//
// SETUP: get a free key at https://ocr.space/ocrapi (Free plan: 25,000 requests/month,
// 1MB max file size — the frontend compresses photos before upload to stay under that) and
// set in backend/.env:
//   OCR_SPACE_API_KEY=<your key>
//
// IMPORTANT — please read before going live:
// 1. OCR.space is a GENERIC OCR engine — it reads text off the image, nothing more. There's
//    no dedicated Aadhaar/CGHS/ECHS/ECAPF/Ayushman field-extraction product behind it (unlike
//    Surepass, which has a purpose-built Aadhaar endpoint). Every card type below is read the
//    same way: send the photo, get raw text back, then this file pattern-matches that text
//    for name/DOB/gender/ID number per card type. This means EVERY result here is inherently
//    lower-accuracy than a purpose-built ID-OCR product, and every result is marked "low"
//    confidence — always show it to the person for review before saving, never auto-submit.
// 2. Aadhaar cards in particular print the name as plain text with no "Name:" label (unlike
//    CGHS/ECHS/Ayushman, which do label their fields), so Aadhaar name extraction uses a
//    layout heuristic (the line right before the DOB line) rather than a label match. This
//    is the least reliable field on the least reliable card type — expect to correct it
//    often, especially on a rotated or skewed photo.
// 3. CAPF cards vary by force (BSF/CRPF/CISF/ITBP/SSB/etc. each print their own layout), so
//    treat CAPF extraction as unreliable across the board.
// 4. Aadhaar numbers are protected under the Aadhaar Act, 2016 / UIDAI guidelines. This file
//    never returns or stores the full 12-digit number — only the last 4 digits, in the
//    standard "masked Aadhaar" format (e.g. "XXXX XXXX 1234"), which is the common compliance
//    practice for businesses that are not a licensed AUA/KUA. Do not change this to store the
//    full number without checking UIDAI's current requirements for your use case.
// 5. The "panel" each card type maps to (below) matches the exact strings the app's Panel
//    dropdown expects (frontend/src/utils/panels.js) — keep them in sync if that list changes.
// 6. Upgrade path: if accuracy on Aadhaar specifically becomes a problem, Surepass's dedicated
//    Aadhaar OCR endpoint (https://kyc-api.surepass.io/api/v1/ocr/aadhaar) can be swapped in
//    just for the AADHAAR case — everything else here (CGHS/ECHS/CAPF/Ayushman regex parsing)
//    would stay as-is either way, since no provider offers structured extraction for those.

const OCR_SPACE_URL = "https://api.ocr.space/parse/image";

const CARD_TYPES = ["AADHAAR", "AYUSHMAN", "CGHS", "ECHS", "CAPF"];
export { CARD_TYPES };

// The panel this card implies for billing, matching frontend/src/utils/panels.js exactly.
// Aadhaar is an identity document, not a payer, so it doesn't map to a panel.
const PANEL_BY_CARD_TYPE = {
  AADHAAR: null,
  AYUSHMAN: "AYUSHMAN BHARAT",
  CGHS: "CGHS",
  ECHS: "ECHS",
  CAPF: "CAPF",
};

function maskAadhaarNumber(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `XXXX XXXX ${digits.slice(-4)}`;
}

function genderFromText(text) {
  if (!text) return null;
  const t = text.trim().toUpperCase();
  if (t.startsWith("M")) return "MALE";
  if (t.startsWith("F")) return "FEMALE";
  return "OTHER";
}

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Parses ISO (YYYY-MM-DD, seen on the BSF/CAPF sample card), Indian-convention DD/MM/YYYY
// (seen on a real CGHS card), or "DD Mon YYYY" (e.g. "26 Nov 1943", seen on a real ECHS
// card) dates. Deliberately NOT using `new Date(dobString)` for the slash/dash format — JS's
// native parser reads that as MM/DD/YYYY (US convention), which silently miscalculates age
// for any Indian-format date where the day is 12 or less (e.g. "12/07/2004" = 12 July 2004
// in India, but December 7 2004 to the native parser).
function parseDobString(str) {
  if (!str) return null;
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const indian = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (indian) {
    let [, day, month, year] = indian;
    if (year.length === 2) year = (Number(year) > 30 ? "19" : "20") + year;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const textMonth = str.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (textMonth) {
    const monthIdx = MONTH_INDEX[textMonth[2].toLowerCase().slice(0, 3)];
    if (monthIdx !== undefined) {
      const d = new Date(Number(textMonth[3]), monthIdx, Number(textMonth[1]));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

// Computes age from either a full DOB or just a year-of-birth, whichever was available.
function ageFrom(dob, yearOfBirth) {
  const now = new Date();
  const d = parseDobString(dob);
  if (d) {
    let age = now.getFullYear() - d.getFullYear();
    const hadBirthdayThisYear = now.getMonth() > d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() >= d.getDate());
    if (!hadBirthdayThisYear) age -= 1;
    return age > 0 && age < 130 ? age : null;
  }
  if (yearOfBirth) {
    const y = parseInt(yearOfBirth, 10);
    if (y > 1900 && y <= now.getFullYear()) return now.getFullYear() - y;
  }
  return null;
}

async function callOcrSpace(buffer, filename, mimetype) {
  if (!process.env.OCR_SPACE_API_KEY) {
    throw new Error("OCR_SPACE_API_KEY is not set — card scanning is not configured on this server.");
  }

  const form = new FormData();
  form.append("apikey", process.env.OCR_SPACE_API_KEY);
  form.append("language", "eng");
  form.append("OCREngine", "2"); // engine 2 handles mixed layouts / smaller text better than engine 1
  form.append("scale", "true");  // upscales low-res images, helps with small printed card text
  form.append("file", new Blob([buffer], { type: mimetype }), filename || "card.jpg");

  const res = await fetch(OCR_SPACE_URL, { method: "POST", body: form });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data) {
    throw new Error(`OCR.space request failed (HTTP ${res.status})`);
  }
  if (data.IsErroredOnProcessing) {
    const message = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join("; ") : data.ErrorMessage;
    throw new Error(message || "OCR.space could not process this image");
  }
  return data?.ParsedResults?.[0]?.ParsedText || "";
}

// DOB patterns cover plain English labels, the bilingual "जन्म तिथि/DOB" label Indian
// government cards commonly use, and all three date formats seen in the wild so far: ISO
// YYYY-MM-DD (BSF/CAPF sample), DD/MM/YYYY (CGHS sample), and "DD Mon YYYY" e.g. "26 Nov
// 1943" (ECHS sample). "dob" is matched as a whole word so it can't accidentally match "DOM"
// (Date of Membership, printed right next to DOB on ECHS cards) or similar near-miss labels.
const DATE_FORMATS = "\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4}";
const DOB_PATTERN = new RegExp(`(?:\\bdob\\b|date of birth|जन्म\\s*तिथि)\\s*[:\\/]?\\s*(${DATE_FORMATS})`, "i");
const ANY_DATE_PATTERN = new RegExp(`\\b(${DATE_FORMATS})\\b`, "i");
const GENDER_PATTERN = /\b(male|female|पुरुष|महिला)\b/i;

// Multi-column card layouts (photo next to text) routinely scramble OCR reading order, so a
// label and its value can end up several lines apart with unrelated text in between — e.g. a
// real BSF/CAPF sample card read "DOB :" and its actual date with someone else's name printed
// between them. Rather than requiring the value right next to its label, this falls back to
// "the only date-shaped thing on the card" if the strict label match comes up empty.
function extractDob(text) {
  const labeled = text.match(DOB_PATTERN);
  if (labeled) return labeled[1];
  const anyDate = text.match(ANY_DATE_PATTERN);
  return anyDate ? anyDate[1] : null;
}

// Which line (by index) the DOB was actually found on — used by the Aadhaar name heuristic
// below, since knowing *which line* matters more than just knowing a date was found somewhere.
function findDobLineIndex(lines) {
  let idx = lines.findIndex((l) => DOB_PATTERN.test(l));
  if (idx === -1) idx = lines.findIndex((l) => ANY_DATE_PATTERN.test(l));
  return idx;
}

// Words that show up in card boilerplate/labels — a candidate "name" line containing any of
// these is almost certainly a label or scheme name, not a person.
const NAME_EXCLUDE_WORDS = /\b(dob|dept|of|father|mother|spouse|wife|husband|son|daughter|male|female|gender|sex|echs|cghs|capf|bsf|crpf|cisf|itbp|ssb|nsg|ayushman|bharat|pmjay|pm-jay|abha|id|no|number|card|government|ministry|servicemen|central|armed|police|force|scheme|health|insurance|beneficiary|patient|name|issue|issued|date|valid|validity|expiry|expires|india)\b/i;

// Extracts just the leading name-shaped portion of a line, rather than requiring the WHOLE
// line to be clean — real cards routinely have noise trailing right after the name on the
// same line (a handwritten serial number scrawled next to it, a stray OCR artifact), and a
// whole-line match would reject the entire line over one bad trailing character rather than
// just ignoring it.
function extractLeadingName(line) {
  if (!line) return null;
  const match = line.trim().match(/^[A-Za-z][A-Za-z.\s]*/);
  if (!match) return null;
  const candidate = match[0].trim();
  if (candidate.length < 5 || candidate.length > 50) return null;
  const words = candidate.split(/\s+/);
  if (words.length < 2 || words.length > 5) return null;
  if (words.some((w) => w.replace(/\./g, "").length < 2)) return null;
  if (NAME_EXCLUDE_WORDS.test(candidate)) return null;
  return candidate;
}

// Relationship labels ("Father of", "Spouse of", etc.) appear on dependent/family cards
// (CGHS, ECHS, CAPF) right next to the cardholder's own name on a clean layout — used as a
// secondary hint when a labeled "Name:" field isn't present.
const RELATION_LABEL_PATTERN = /\b(father|mother|spouse|wife|husband|son|daughter)\s*of\b/i;

// Tries, in order: an explicit "Name:"/"Beneficiary Name:" label; the line next to a
// relationship label ("Father of" etc.); then simply the first line on the card that reads
// like a person's name. Each step is a weaker guess than the last — this is why every
// non-Aadhaar result is marked "low" confidence regardless of which step succeeded.
function extractPersonName(text, lines) {
  const labeled = text.match(/(?:beneficiary\s*name|patient\s*name|name)\s*[:\-]?\s*([A-Za-z\s.]{3,60})/i);
  if (labeled) return labeled[1].trim().replace(/\s+/g, " ");

  const relationIdx = lines.findIndex((l) => RELATION_LABEL_PATTERN.test(l));
  if (relationIdx >= 0) {
    for (const candidate of [lines[relationIdx - 1], lines[relationIdx + 1]]) {
      const name = extractLeadingName(candidate);
      if (name) return name;
    }
  }

  for (const line of lines) {
    const name = extractLeadingName(line);
    if (name) return name;
  }
  return null;
}

function parseAadhaarText(rawText) {
  const text = (rawText || "").replace(/\r/g, "\n");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const dob = extractDob(text);
  const genderMatch = text.match(GENDER_PATTERN);
  const aadhaarMatch = text.match(/\b(\d{4}\s?\d{4}\s?\d{4})\b/);

  // Aadhaar cards don't label the name field at all, and are covered in Hindi text that OCR
  // often garbles into Latin-letter noise which can accidentally *look* like a plausible name
  // (right shape, wrong content — e.g. a real card once produced "HRE BROR" ahead of the
  // actual name). The one layout detail that's held up across every real sample so far: the
  // English name sits on the line immediately above the DOB line. That's a much stronger
  // signal than "the first name-shaped line in the whole document", so it's tried first, and
  // only falls back to the generic scan if the DOB line itself couldn't be located.
  const dobLineIdx = findDobLineIndex(lines);
  const nameNearDob = dobLineIdx > 0 ? extractLeadingName(lines[dobLineIdx - 1]) : null;
  const patientName = nameNearDob || extractPersonName(text, lines);

  return {
    cardType: "AADHAAR",
    patientName,
    patientAge: ageFrom(dob, null),
    patientGender: genderMatch ? genderFromText(genderMatch[1]) : null,
    dob,
    idNumberMasked: maskAadhaarNumber(aadhaarMatch?.[1]),
    forceType: null,
    wardType: null,
    panel: PANEL_BY_CARD_TYPE.AADHAAR,
    confidence: "low",
  };
}

// Ayushman Bharat (PM-JAY), CGHS, and ECHS cards generally do label their ID field, even if
// they don't always label the name (see extractPersonName above for the fallback chain).
// The AYUSHMAN pattern requires "no"/"number" after "card" rather than treating it as
// optional — a real card's official scheme name printed at the bottom ("AYUSHMAN BHARAT
// PRADHAN MANTRI JAN AROGYA YOJANA") otherwise gets matched as if "Ayushman Bharat" itself
// were a label, grabbing the next word ("PRADHAN") as if it were the ID.
const ID_LABEL_PATTERNS = {
  AYUSHMAN: /(?:pmjay\s*id|pm-?jay\s*id|ayushman\s*(?:bharat)?\s*card\s*(?:no\.?|number))\s*[:\-]?\s*([A-Za-z0-9\-/]{6,25})/i,
  CGHS: /(?:cghs\s*(?:card\s*)?(?:no\.?|number|id)|beneficiary\s*no\.?)\s*[:\-]?\s*([A-Za-z0-9\-/]{4,20})/i,
  ECHS: /(?:echs\s*(?:card\s*)?(?:no\.?|number|id))\s*[:\-]?\s*([A-Za-z0-9\-/]{4,20})/i,
};

// Real samples showed ECHS and CGHS cards often DON'T label their ID field at all — same
// unlabeled style as the CAPF/BSF card. ECHS prints a letter-prefixed, grouped-digit number
// ("BR 0000 0191 6229", like Aadhaar's format with a 1-3 letter service-branch prefix). CGHS
// prints a bare 6-8 digit number right next to the name; the narrow digit-length range is
// deliberate so this doesn't accidentally grab a barcode number (much longer) or a date.
const ECHS_ID_FALLBACK = /\b([A-Z]{1,3}\s?\d{4}\s?\d{4}\s?\d{4})\b/;
const CGHS_ID_FALLBACK = /\b(\d{6,8})\b/;

function extractLabelFreeId(cardType, text) {
  if (cardType === "ECHS") return text.match(ECHS_ID_FALLBACK)?.[1] || null;
  if (cardType === "CGHS") return text.match(CGHS_ID_FALLBACK)?.[1] || null;
  return null;
}

// A label and its value can end up several lines apart on multi-column/scrambled cards (same
// root cause as the DOB/CAPF fixes above) — this scans a few lines after wherever a label
// pattern was found for the first line that's just a compact alphanumeric token, skipping
// over other labeled fields (which have colons/spaces/words) in between. Used for Ayushman's
// PM-JAY ID, which was found 2 lines away from its own label on a real sample card.
function findValueNearLabel(lines, labelPattern, maxLinesAhead = 4) {
  const idx = lines.findIndex((l) => labelPattern.test(l));
  if (idx === -1) return null;
  for (let i = idx + 1; i < Math.min(idx + 1 + maxLinesAhead, lines.length); i++) {
    const candidate = lines[i].trim();
    if (/^[A-Za-z0-9]{6,15}$/.test(candidate)) return candidate;
  }
  return null;
}

// A real BSF card had no "CAPF ID:" style label at all — just the force's short name (BSF/
// CRPF/etc.) followed by an ID with no label in between. This also carried its own PM-JAY ID,
// meaning it was actually an Ayushman-linked CAPF card — see the panel upgrade below.
const CAPF_FORCE_PATTERN = /\b(BSF|CRPF|CISF|ITBP|SSB|NSG|AR)\b/i;
const PMJAY_ID_PATTERN = /pm-?jay\s*id\s*[:\-]?\s*([A-Za-z0-9]{6,20})/i;
// Looser than PMJAY_ID_PATTERN above — just finds the label LINE, without requiring the value
// to be adjacent to it, for use with findValueNearLabel's forward-scan.
const PMJAY_ID_LINE_PATTERN = /pm-?jay\s*id/i;

// "Force type" means something different per card type, so this fills it in with whichever
// is relevant and leaves it null otherwise: the paramilitary force itself for CAPF (from the
// pattern above), the service branch for ECHS (a real sample card printed "ARMY" as a
// standalone category line), or the beneficiary category for CGHS (a real sample printed
// "Pensioner" right next to the beneficiary number) — CGHS doesn't have a "force" as such,
// but this is the closest equivalent info actually printed on the card.
const ECHS_FORCE_PATTERN = /\b(ARMY|NAVY|AIR FORCE|AF)\b/i;
const CGHS_CATEGORY_PATTERN = /\b(pensioner|serving)\b/i;
function extractForceType(cardType, text) {
  if (cardType === "CAPF") {
    const m = text.match(CAPF_FORCE_PATTERN);
    return m ? m[1].toUpperCase() : null;
  }
  if (cardType === "ECHS") {
    const m = text.match(ECHS_FORCE_PATTERN);
    return m ? m[1].toUpperCase() : null;
  }
  if (cardType === "CGHS") {
    const m = text.match(CGHS_CATEGORY_PATTERN);
    return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null;
  }
  return null;
}

// Ward entitlement (General / Semi-Private / Private) — seen labeled in Hindi+English on a
// real CGHS card ("सेमी-प्राइवेट वार्ड / Semi-Private Ward"). Checked for all panel card types
// since ECHS/CAPF may print the same style of entitlement even though no sample confirmed it.
const WARD_TYPE_PATTERN = /\b(general|semi-?private|private)\s*ward\b/i;
function extractWardType(text) {
  const m = text.match(WARD_TYPE_PATTERN);
  if (!m) return null;
  const kind = m[1].toLowerCase().replace(/[\s-]+/g, "");
  if (kind === "general") return "General Ward";
  if (kind === "private") return "Private Ward";
  return "Semi-Private Ward";
}

function extractCapfId(lines) {
  const forceLineIdx = lines.findIndex((l) => CAPF_FORCE_PATTERN.test(l));
  if (forceLineIdx === -1) return null;
  const sameLine = lines[forceLineIdx].match(/\/?\s*([A-Za-z0-9]{8,20})/);
  if (sameLine) return sameLine[1];
  const nextLine = lines[forceLineIdx + 1];
  return nextLine && /^[A-Za-z0-9]{6,20}$/.test(nextLine) ? nextLine : null;
}

function parseLabeledCardText(cardType, rawText) {
  const text = (rawText || "").replace(/\r/g, "\n");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const ageMatch = text.match(/age\s*[:\-]?\s*(\d{1,3})/i);
  // Ayushman cards print "YOB: 1976" (Year of Birth) rather than a full DOB — ageFrom already
  // supports computing from just a year, this just needed to actually be extracted and passed.
  const yobMatch = text.match(/\bYOB\s*[:\-]?\s*(\d{4})\b/i);
  const genderMatch = text.match(/(?:gender|sex)\s*[:\-]?\s*(male|female|other|m|f)\b/i) || text.match(GENDER_PATTERN);
  const dob = extractDob(text);
  const age = ageMatch ? parseInt(ageMatch[1], 10) : ageFrom(dob, yobMatch?.[1]);

  const pmjayMatch = text.match(PMJAY_ID_PATTERN);
  // A CAPF card that also carries its own PM-JAY ID is the "AYUSHMAN CAPF" scheme
  // specifically, not plain CAPF — matches the distinct entry in the app's panel list. On
  // that combined card, the PM-JAY ID is what's actually used for Ayushman claims, so it
  // takes priority over the plain BSF/CRPF/etc. service number as the card number shown —
  // the force ID is still captured separately via forceType below, just not as "the" number.
  const idNumber =
    cardType === "CAPF"
      ? pmjayMatch?.[1] || extractCapfId(lines)
      : cardType === "AYUSHMAN"
      ? text.match(ID_LABEL_PATTERNS.AYUSHMAN)?.[1]?.trim() || findValueNearLabel(lines, PMJAY_ID_LINE_PATTERN)
      : text.match(ID_LABEL_PATTERNS[cardType])?.[1]?.trim() || extractLabelFreeId(cardType, text);
  const panel = cardType === "CAPF" && pmjayMatch ? "AYUSHMAN CAPF" : PANEL_BY_CARD_TYPE[cardType];

  return {
    cardType,
    patientName: extractPersonName(text, lines),
    patientAge: age && age > 0 && age < 130 ? age : null,
    patientGender: genderMatch ? genderFromText(genderMatch[1]) : null,
    dob,
    // None of these card numbers are UIDAI-regulated the way Aadhaar is, so no masking here.
    idNumberMasked: idNumber || null,
    forceType: extractForceType(cardType, text),
    wardType: extractWardType(text),
    panel,
    confidence: "low",
  };
}

/**
 * Extracts patient details from a photo of an identity or health-scheme card.
 * Always returns a best-effort result meant for the person to review/edit before submitting
 * — it only throws for a hard failure (bad file, provider down, missing API key), never just
 * because a field couldn't be read.
 *
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.filename
 * @param {string} params.mimetype
 * @param {"AADHAAR"|"AYUSHMAN"|"CGHS"|"ECHS"|"CAPF"} params.cardType
 */
export async function extractFromCardImage({ buffer, filename, mimetype, cardType }) {
  if (!CARD_TYPES.includes(cardType)) {
    throw new Error(`Unknown card type — expected one of ${CARD_TYPES.join(", ")}`);
  }
  const rawText = await callOcrSpace(buffer, filename, mimetype);
  const result = cardType === "AADHAAR" ? parseAadhaarText(rawText) : parseLabeledCardText(cardType, rawText);

  // Always print what OCR.space actually read, alongside what we extracted from it — not
  // just on a total miss. A WRONG extraction (picked up junk text instead of the real name,
  // like "sue Dale" off an Aadhaar card) doesn't trip the old "nothing matched" condition
  // this used to check, but it's just as important to be able to debug. Search for
  // "[OCR DEBUG]" with `pm2 logs` or `journalctl` to find these.
  console.log(`[OCR DEBUG] ${cardType} — extracted:`, result, `\nRaw text was:\n${rawText || "(empty)"}`);

  return result;
}
