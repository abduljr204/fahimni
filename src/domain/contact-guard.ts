/**
 * Detects contact details and off-platform arrangements in chat messages sent before a
 * booking is paid. The composer runs it for instant feedback and the messaging service
 * runs it again, so a modified client cannot skip it.
 *
 * LIMITS (by design, see docs/PRE_BOOKING_AND_CLASSROOM.md): this is pattern matching, not
 * understanding. It catches common formats and some disguises (Arabic digits, spaced or
 * spelled-out numbers, "name at gmail dot com"), but determined users can get around it
 * with creative spelling, and it cannot read text inside images or PDFs. It reduces fee
 * bypassing; it cannot prevent it.
 */

export type ContactFindingKind = "phone" | "email" | "social" | "link" | "address" | "off_platform_payment";

export interface ContactFinding {
  kind: ContactFindingKind;
  /** The matched text, as written in the original message. */
  match: string;
  index: number;
  length: number;
}

// Arabic-Indic and Persian digits → ASCII, keeping string length so indexes stay valid.
function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "صفر", "واحد", "اثنين", "اثنان", "ثلاثة", "ثلاث", "أربعة", "اربعة", "أربع", "خمسة", "خمس", "ستة", "ست", "سبعة", "سبع", "ثمانية", "ثمنية", "تسعة", "تسع",
];

const PLATFORMS = [
  "whats\\s*app", "whatsapp", "واتس\\s*اب", "واتساب", "واتسآب", "واتس", "وتساب", "وتس",
  "telegram", "تيليجرام", "تلغرام", "تليغرام", "تلجرام",
  "instagram", "insta", "انستغرام", "انستقرام", "انستجرام", "انستا", "إنستغرام", "إنستا",
  "facebook", "فيسبوك", "فيس\\s*بوك", "فيس", "messenger", "ماسنجر", "مسنجر",
  // Plain English words such as "snap", "signal" and "imo" are left out: too common in study chat.
  "snap\\s*chat", "سناب\\s*شات", "سناب",
  "tik\\s*tok", "تيك\\s*توك", "viber", "فايبر", "سيجنال", "ايمو", "إيمو",
  "skype", "سكايب", "discord", "ديسكورد", "linkedin", "لينكد\\s*ان", "twitter", "تويتر",
];

/** Patterns run on the digit-normalised text. Order matters only for readability. */
const PATTERNS: { kind: ContactFindingKind; re: RegExp }[] = [
  // Emails, including "name at gmail dot com" and "name [at] gmail".
  { kind: "email", re: /[\p{L}\p{N}._%+-]+\s*(?:@|\[at\]|\(at\)|\sat\s|\sآت\s)\s*[\p{L}\p{N}-]+\s*(?:\.|\[dot\]|\(dot\)|\sdot\s|\sدوت\s)\s*[a-z]{2,}/giu },
  { kind: "email", re: /\b(?:g\s*mail|hot\s*mail|yahoo|outlook|icloud|proton\s*mail)\b|جيميل|جي\s*ميل|هوتميل|ياهو/giu },
  // Links and domains, including map links and shorteners.
  { kind: "link", re: /\b(?:https?:\/\/|www\.)\S+/gi },
  { kind: "link", re: /\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|ly|me|io|app|link|co|info|biz|page|gl)(?:\/\S*)?\b/gi },
  // Social platforms and handles.
  // Arabic attaches the article and short prepositions: الانستا، بالواتساب، عالواتس.
  { kind: "social", re: new RegExp(`(?<![\\p{L}])(?:ال|بال|عال|وال|فال|ع)?(?:${PLATFORMS.join("|")})(?![\\p{L}])`, "giu") },
  { kind: "social", re: /(?<![\p{L}\p{N}._%+-])@[\p{L}\p{N}_.]{3,}/gu },
  // Phone numbers: 9+ digits (Libyan mobiles have 10), allowing spaces, dots, dashes and brackets between them.
  { kind: "phone", re: /(?:\+|00)?\d(?:[\s().\-/_]*\d){8,}/g },
  // Spelled-out numbers: five or more number words in a row.
  { kind: "phone", re: new RegExp(`(?:(?:${NUMBER_WORDS.join("|")})[\\s,،\\-]+){4,}(?:${NUMBER_WORDS.join("|")})`, "giu") },
  // Exact places: building/flat/floor/house numbers, numbered streets, GPS coordinates.
  { kind: "address", re: /\b(?:apartment|apt|flat|building|bldg|floor|house|villa|room)\s*(?:no\.?|number|#)?\s*\d+/gi },
  { kind: "address", re: /\b\d+\s*,?\s*[\p{L}]+\s+(?:street|st\.?|road|rd\.?|avenue|ave\.?)\b/giu },
  { kind: "address", re: /(?:عمارة|عماره|شقة|شقه|الطابق|طابق|الدور|بناية|بنايه|فيلا|منزل|بيت|مبنى)\s*(?:رقم)?\s*\d+/gu },
  { kind: "address", re: /شارع\s+(?:[\p{L}]+\s+){0,3}\d+|\d+\s+شارع/gu },
  { kind: "address", re: /-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g },
  // Paying privately or around the platform. Asking about the official cash option is fine.
  {
    kind: "off_platform_payment",
    re: /\b(?:pay|paying|payment|transfer|send(?: me)?(?: the)? money)\b[^.!?\n]{0,25}\b(?:directly|privately|outside|off(?:\s|-)?(?:the\s)?(?:app|platform)|without (?:the )?(?:app|platform|fahimni)|to my (?:account|bank|card|wallet))\b/gi,
  },
  { kind: "off_platform_payment", re: /\b(?:skip|avoid|bypass|save on)\b[^.!?\n]{0,20}\b(?:fee|fees|commission|app|platform)\b/gi },
  { kind: "off_platform_payment", re: /\b(?:iban|bank account|account number|my account no)\b/gi },
  {
    kind: "off_platform_payment",
    re: /(?:ادفع|إدفع|تدفع|ادفعلي|دفع|حول|حوّل|تحويل|حوالة|خلص|خلّص|نخلص|نتحاسب)[^.!؟?\n]{0,25}(?:مباشرة|مباشره|برا|بره|خارج|بدون\s+(?:التطبيق|المنصة|فهمني|عمولة)|على\s+حسابي|لحسابي)/gu,
  },
  { kind: "off_platform_payment", re: /(?:خارج|برا|بره|بدون)\s+(?:التطبيق|المنصة|المنصه|فهمني)|رقم\s+حسابي|حسابي\s+(?:المصرفي|البنكي)|بدون\s+عمولة|نتفاهم\s+برا/gu },
];

/** Dates such as 2026-10-27 or 27/10/2026 have enough digits to look like phone numbers. */
const DATE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/;

export function detectContactDetails(text: string): ContactFinding[] {
  const source = normalizeDigits(text);
  const found: ContactFinding[] = [];
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of source.matchAll(re)) {
      const index = m.index ?? 0;
      if (kind === "phone" && DATE.test(m[0].trim())) continue;
      found.push({ kind, match: text.slice(index, index + m[0].length).trim(), index, length: m[0].length });
    }
  }
  // Keep the first, longest match where findings overlap (an email also looks like a link).
  found.sort((a, b) => a.index - b.index || b.length - a.length);
  const result: ContactFinding[] = [];
  for (const f of found) {
    const last = result.at(-1);
    if (last && f.index < last.index + last.length) continue;
    result.push(f);
  }
  return result;
}

/** Replaces every finding with a neutral mask so the rest of the message can still be sent. */
export function redactContactDetails(text: string, findings = detectContactDetails(text)): string {
  let out = text;
  for (const f of [...findings].sort((a, b) => b.index - a.index)) {
    out = `${out.slice(0, f.index)}•••${out.slice(f.index + f.length)}`;
  }
  return out;
}

export function findingKinds(findings: ContactFinding[]): ContactFindingKind[] {
  return [...new Set(findings.map((f) => f.kind))];
}
