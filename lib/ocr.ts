const VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate";
const MAX_PDF_PAGES = 10;
const OCR_DEBUG =
  process.env.OCR_DEBUG === "true" && process.env.NODE_ENV !== "production";

function debugOcr(message: string, details?: Record<string, unknown>) {
  if (!OCR_DEBUG) return;
  if (details) {
    console.debug(`[ocr] ${message}`, details);
    return;
  }
  console.debug(`[ocr] ${message}`);
}

async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, isEvalSupported: false, disableFontFace: true }).promise;

  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  const pages: string[] = [];

  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = content.items.filter(
        (item): item is typeof item & { str: string; transform: number[] } =>
          "str" in item && "transform" in item
      );

      if (items.length === 0) continue;

      // Build lines using Y-position to detect line breaks
      let lastY: number | null = null;
      const parts: string[] = [];
      for (const item of items) {
        const y = item.transform[5]; // ty = vertical position
        if (lastY !== null && Math.abs(y - lastY) > 3) {
          parts.push("\n");
        } else if (parts.length > 0 && !parts[parts.length - 1].endsWith("\n")) {
          parts.push(" ");
        }
        parts.push(item.str);
        lastY = y;
      }

      const pageText = parts.join("").trim();
      if (pageText) {
        pages.push(pageText);
      }
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

type OcrResult = {
  title: string;
  date: string;
  amount: number;
  category: string;
  confidence: number | null;
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Pharmacy: [
    "pharmacy", "rx", "prescription", "cvs", "walgreens", "rite aid", "drug",
    "medication", "refill", "copay"
  ],
  Dental: [
    "dental", "dentist", "orthodont", "oral", "teeth", "tooth", "crown",
    "filling", "cleaning", "periodon"
  ],
  Vision: [
    "vision", "optical", "optometr", "eye", "lenscrafters", "glasses", "contacts",
    "ophthalmolog", "eyewear", "frames", "lenses"
  ],
  Medical: [
    "medical", "clinic", "hospital", "urgent care", "doctor", "physician", "health",
    "patient", "office visit", "copay", "deductible", "provider", "healthcare",
    "primary care", "specialist", "exam", "consultation"
  ],
  "Lab/Test": [
    "lab", "laboratory", "pathology", "diagnostic", "blood", "test", "specimen",
    "radiology", "imaging", "x-ray", "mri", "ct scan", "ultrasound"
  ],
  "Mental Health": [
    "mental", "therapy", "therapist", "counseling", "psychiatr", "psycholog",
    "behavioral", "anxiety", "depression"
  ],
  "Physical Therapy": [
    "physical therapy", "physiotherapy", "rehab", "chiropractic", "pt visit",
    "occupational therapy"
  ]
};

function extractTitle(lines: string[]): string {
  const skipPatterns = [
    /^page\s*\d+/i,
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
    /^(statement|invoice|receipt|bill)$/i,
    /^\s*$/
  ];

  for (const line of lines.slice(0, 10)) {
    const cleaned = line.trim();
    if (cleaned.length < 3 || cleaned.length > 80) continue;
    if (skipPatterns.some(p => p.test(cleaned))) continue;
    if (/^\d+[\d\s.\/\-]+$/.test(cleaned)) continue;

    if (/[A-Za-z]/.test(cleaned)) {
      return cleaned;
    }
  }
  return "";
}

function extractDate(text: string): string {
  const candidates: { date: string; index: number; priority: number }[] = [];

  const pattern1 = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g;
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    const year = parseInt(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      candidates.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        index: match.index,
        priority: 1
      });
    }
  }

  const pattern2 = /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/g;
  while ((match = pattern2.exec(text)) !== null) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    const day = parseInt(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      candidates.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        index: match.index,
        priority: 1
      });
    }
  }

  const pattern3 = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})(?!\d)/g;
  while ((match = pattern3.exec(text)) !== null) {
    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    let year = parseInt(match[3]);
    year += year < 50 ? 2000 : 1900;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      candidates.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        index: match.index,
        priority: 2
      });
    }
  }

  const monthNames = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const pattern4 = new RegExp(`(${monthNames})\\.?\\s*(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})`, "gi");
  while ((match = pattern4.exec(text)) !== null) {
    const monthStr = match[1].toLowerCase().slice(0, 3);
    const monthMap: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };
    const month = monthMap[monthStr];
    const day = parseInt(match[2]);
    const year = parseInt(match[3]);
    if (month && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      candidates.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        index: match.index,
        priority: 1
      });
    }
  }

  const pattern5 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\.?,?\\s*(\\d{4})`, "gi");
  while ((match = pattern5.exec(text)) !== null) {
    const day = parseInt(match[1]);
    const monthStr = match[2].toLowerCase().slice(0, 3);
    const monthMap: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };
    const month = monthMap[monthStr];
    const year = parseInt(match[3]);
    if (month && day >= 1 && day <= 31 && year >= 2000 && year <= 2099) {
      candidates.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        index: match.index,
        priority: 1
      });
    }
  }

  const lower = text.toLowerCase();
  const dateKeywords = [
    { keyword: "date of service", priority: 10 },
    { keyword: "service date", priority: 10 },
    { keyword: "dos:", priority: 10 },
    { keyword: "dos ", priority: 10 },
    { keyword: "statement date", priority: 8 },
    { keyword: "invoice date", priority: 8 },
    { keyword: "visit date", priority: 9 },
    { keyword: "procedure date", priority: 9 },
    { keyword: "date:", priority: 7 },
    { keyword: "dated:", priority: 7 }
  ];

  for (const { keyword, priority } of dateKeywords) {
    let searchIdx = 0;
    while (true) {
      const idx = lower.indexOf(keyword, searchIdx);
      if (idx === -1) break;
      searchIdx = idx + 1;

      const nearbyCandidate = candidates.find(c => c.index > idx && c.index < idx + 60);
      if (nearbyCandidate) {
        nearbyCandidate.priority += priority;
      }
    }
  }

  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.index - b.index;
  });

  if (candidates.length > 0) {
    return candidates[0].date;
  }

  return "";
}

const AMOUNT_KEYWORDS = [
  { keyword: "patient responsibility", priority: 10 },
  { keyword: "amount you owe", priority: 10 },
  { keyword: "you owe", priority: 9 },
  { keyword: "pay this amount", priority: 9 },
  { keyword: "please pay", priority: 9 },
  { keyword: "your share", priority: 10 },
  { keyword: "member responsibility", priority: 10 },
  { keyword: "member owes", priority: 10 },
  { keyword: "patient owes", priority: 10 },
  { keyword: "you pay", priority: 9 },
  { keyword: "amt due", priority: 8 },
  { keyword: "what you owe", priority: 10 },
  { keyword: "out of pocket", priority: 9 },
  { keyword: "out-of-pocket", priority: 9 },
  { keyword: "patient portion", priority: 9 },
  { keyword: "member share", priority: 9 },
  { keyword: "amount not covered", priority: 8 },
  { keyword: "not covered", priority: 6 },
  { keyword: "remaining balance", priority: 8 },
  { keyword: "estimated cost", priority: 7 },
  { keyword: "billed to patient", priority: 9 },
  { keyword: "charged to you", priority: 9 },
  { keyword: "amount due", priority: 8 },
  { keyword: "total due", priority: 8 },
  { keyword: "balance due", priority: 8 },
  { keyword: "total amount due", priority: 8 },
  { keyword: "total patient", priority: 8 },
  { keyword: "patient total", priority: 8 },
  { keyword: "your cost", priority: 8 },
  { keyword: "your responsibility", priority: 8 },
  { keyword: "total charges", priority: 7 },
  { keyword: "total charge", priority: 7 },
  { keyword: "grand total", priority: 7 },
  { keyword: "total cost", priority: 7 },
  { keyword: "subtotal", priority: 5 },
  { keyword: "total:", priority: 6 },
  { keyword: "total", priority: 5 },
  { keyword: "amount:", priority: 5 },
  { keyword: "amount", priority: 4 },
  { keyword: "balance:", priority: 5 },
  { keyword: "balance", priority: 4 },
  { keyword: "copay", priority: 6 },
  { keyword: "co-pay", priority: 6 },
  { keyword: "deductible", priority: 5 },
  { keyword: "coinsurance", priority: 5 }
];

function extractAmount(text: string): number {
  const candidates: { amount: number; index: number; priority: number }[] = [];
  const lower = text.toLowerCase();

  const dollarPattern = /\$\s?([\d,]+\.?\d{0,2})/g;
  let match;
  while ((match = dollarPattern.exec(text)) !== null) {
    const value = parseFloat(match[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0 && value < 100000) {
      candidates.push({ amount: value, index: match.index, priority: 1 });
    }
  }

  const plainPattern = /(?<![.\d])([\d,]+\.\d{2})(?![.\d])/g;
  while ((match = plainPattern.exec(text)) !== null) {
    const value = parseFloat(match[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0 && value < 100000) {
      const alreadyExists = candidates.some(c =>
        Math.abs(c.index - match!.index) < 5 && Math.abs(c.amount - value) < 0.01
      );
      if (!alreadyExists) {
        candidates.push({ amount: value, index: match.index, priority: 0 });
      }
    }
  }

  for (const { keyword, priority } of AMOUNT_KEYWORDS) {
    let searchIdx = 0;
    while (true) {
      const idx = lower.indexOf(keyword, searchIdx);
      if (idx === -1) break;
      searchIdx = idx + 1;

      for (const candidate of candidates) {
        if (candidate.index > idx && candidate.index < idx + 80) {
          candidate.priority += priority;
        }
      }
    }
  }

  for (const candidate of candidates) {
    const start = Math.max(0, candidate.index - 30);
    const end = Math.min(text.length, candidate.index + 30);
    const context = text.slice(start, end).toLowerCase();

    if (context.includes("phone") || context.includes("fax") || context.includes("tel")) {
      candidate.priority -= 10;
    }
    if (context.includes("account") && context.includes("#")) {
      candidate.priority -= 5;
    }
  }

  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.amount - a.amount;
  });

  if (candidates.length > 0 && candidates[0].priority > 0) {
    return Math.round(candidates[0].amount * 100) / 100;
  }

  if (candidates.length > 0) {
    const largest = candidates.reduce((max, c) => c.amount > max.amount ? c : max);
    return Math.round(largest.amount * 100) / 100;
  }

  return 0;
}

function extractCategory(text: string): string {
  const lower = text.toLowerCase();
  const scores: Record<string, number> = {};

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[category] = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        scores[category]++;
      }
    }
  }

  let bestCategory = "";
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

async function ocrImage(apiKey: string, imageBuffer: Buffer): Promise<{ text: string; confidence: number | null }> {
  const base64 = imageBuffer.toString("base64");

  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [
          { type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }
        ]
      }
    ]
  };

  const response = await fetch(VISION_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Vision API error:", response.status, errorText);
    return { text: "", confidence: null };
  }

  const data = await response.json();

  if (data.responses?.[0]?.error) {
    console.error("Vision API returned error:", data.responses[0].error);
    return { text: "", confidence: null };
  }

  const annotation = data.responses?.[0]?.fullTextAnnotation;
  if (!annotation?.text) {
    return { text: "", confidence: null };
  }

  const pageConfidence = annotation.pages?.[0]?.confidence ?? null;
  return { text: annotation.text, confidence: pageConfidence };
}

function normalizeConfidence(raw: number | null): number | null {
  if (typeof raw !== "number") return null;
  const clamped = raw > 1 ? raw / 100 : raw;
  return Math.round(Math.min(1, clamped) * 100) / 100;
}

export async function runOcr(buffer: Buffer, mimeType: string): Promise<OcrResult> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    console.warn("GOOGLE_VISION_API_KEY not set, skipping OCR");
    return { title: "", date: "", amount: 0, category: "", confidence: null };
  }

  let fullText = "";
  let bestConfidence: number | null = null;
  let pageTexts: string[] = [];

  if (mimeType === "application/pdf") {
    try {
      pageTexts = await extractPdfPages(buffer);
      fullText = pageTexts.join("\n");
      bestConfidence = fullText ? 1.0 : null;
      debugOcr("Extracted PDF text", {
        pages: pageTexts.length,
        charCount: fullText.length
      });
    } catch (error) {
      console.error("PDF text extraction failed:", error);
      return { title: "", date: "", amount: 0, category: "", confidence: null };
    }
  } else {
    const result = await ocrImage(apiKey, buffer);
    fullText = result.text;
    bestConfidence = result.confidence;
  }

  if (!fullText) {
    debugOcr("No text detected");
    return { title: "", date: "", amount: 0, category: "", confidence: null };
  }

  const lines = fullText.split("\n").filter((l: string) => l.trim());

  // For multi-page PDFs, run amount extraction per-page and pick the best
  // (keyword proximity works better within a single page)
  let bestAmount = extractAmount(fullText);
  if (pageTexts.length > 1) {
    let bestPagePriority = -1;
    for (const pageText of pageTexts) {
      const pageAmount = extractAmount(pageText);
      if (pageAmount <= 0) continue;
      // Re-run to check priority — use keyword density as a proxy
      const lower = pageText.toLowerCase();
      let pagePriority = 0;
      for (const { keyword, priority } of AMOUNT_KEYWORDS) {
        if (lower.includes(keyword)) pagePriority += priority;
      }
      if (pagePriority > bestPagePriority) {
        bestPagePriority = pagePriority;
        bestAmount = pageAmount;
      }
    }
  }

  const result = {
    title: extractTitle(lines),
    date: extractDate(fullText),
    amount: bestAmount,
    category: extractCategory(fullText),
    confidence: normalizeConfidence(bestConfidence)
  };
  debugOcr("OCR complete", {
    hasTitle: Boolean(result.title),
    hasDate: Boolean(result.date),
    amount: result.amount,
    category: result.category,
    confidence: result.confidence
  });

  return result;
}
