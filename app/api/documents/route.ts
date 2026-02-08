import { NextRequest, NextResponse } from "next/server";
import {
  readDocumentsFile,
  writeDocumentsFile,
  readModifyWriteDocuments
} from "../../../lib/drive";
import { isAuthError } from "../../../lib/errors";
import { getAccessTokenFromRequest } from "../../../lib/server-auth";
import type { Document, DocumentsFile } from "../../../types/documents";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 1_000_000;
const MAX_SHORT_TEXT = 200;
const MAX_NOTES_TEXT = 5000;

function isDateString(value: unknown): value is string {
  return typeof value === "string" && DATE_REGEX.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isStringWithLimit(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isFiniteAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_AMOUNT
  );
}

function normalizeNullableString(
  value: unknown,
  maxLength: number
): string | null {
  if (value === null) return null;
  if (!isStringWithLimit(value, maxLength)) return null;
  return value.trim();
}

function normalizeOcrConfidence(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return Math.round(value * 100) / 100;
}

function normalizeDocument(value: unknown): Document | null {
  if (!value || typeof value !== "object") return null;
  const doc = value as Partial<Document>;

  if (!isStringWithLimit(doc.id, 100) || doc.id.trim().length === 0) return null;
  if (typeof doc.hasFile !== "boolean") return null;
  if (!isStringWithLimit(doc.user, MAX_SHORT_TEXT)) return null;
  if (!isStringWithLimit(doc.title, MAX_SHORT_TEXT)) return null;
  if (!isStringWithLimit(doc.category, MAX_SHORT_TEXT)) return null;
  if (!isDateString(doc.date)) return null;
  if (!isFiniteAmount(doc.amount)) return null;
  if (!isStringWithLimit(doc.notes, MAX_NOTES_TEXT)) return null;
  if (typeof doc.reimbursed !== "boolean") return null;
  if (!isTimestamp(doc.createdAt)) return null;

  const fileId = normalizeNullableString(doc.fileId, MAX_SHORT_TEXT);
  const filename = normalizeNullableString(doc.filename, MAX_SHORT_TEXT);
  if (doc.hasFile && !fileId) return null;
  if (!doc.hasFile && fileId) return null;

  const ocrConfidence = normalizeOcrConfidence(doc.ocrConfidence);
  if (
    doc.ocrConfidence !== null &&
    doc.ocrConfidence !== undefined &&
    ocrConfidence === null
  ) {
    return null;
  }

  let reimbursedDate: string | null = null;
  if (doc.reimbursedDate === null || doc.reimbursedDate === undefined || doc.reimbursedDate === "") {
    reimbursedDate = null;
  } else if (isDateString(doc.reimbursedDate)) {
    reimbursedDate = doc.reimbursedDate;
  } else {
    return null;
  }

  if (!doc.reimbursed) {
    reimbursedDate = null;
  }

  return {
    id: doc.id.trim(),
    fileId,
    filename,
    hasFile: doc.hasFile,
    user: doc.user.trim(),
    title: doc.title.trim() || "Untitled document",
    category: doc.category.trim(),
    date: doc.date,
    amount: Math.round(doc.amount * 100) / 100,
    notes: doc.notes.trim(),
    reimbursed: doc.reimbursed,
    reimbursedDate,
    createdAt: doc.createdAt,
    ocrConfidence
  };
}

function normalizeDocumentsFile(value: unknown): DocumentsFile | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<DocumentsFile>;
  if (!Array.isArray(parsed.documents)) return null;

  const version =
    typeof parsed.version === "number" &&
    Number.isInteger(parsed.version) &&
    parsed.version > 0
      ? parsed.version
      : 1;

  const documents: Document[] = [];
  for (const rawDocument of parsed.documents) {
    const normalized = normalizeDocument(rawDocument);
    if (!normalized) return null;
    documents.push(normalized);
  }

  return {
    version,
    documents
  };
}

export async function GET(request: NextRequest) {
  const accessToken = await getAccessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await readDocumentsFile(accessToken);
    return NextResponse.json(data);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to load documents", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const accessToken = await getAccessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const validated = normalizeDocumentsFile(body);
    if (!validated) {
      return NextResponse.json(
        { error: "Invalid document schema" },
        { status: 400 }
      );
    }

    await writeDocumentsFile(accessToken, validated);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to update documents", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const accessToken = await getAccessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: Partial<Document>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const now = new Date();
    const amount = isFiniteAmount(body.amount) ? body.amount : 0;
    const reimbursed = typeof body.reimbursed === "boolean" ? body.reimbursed : false;
    const reimbursedDate =
      reimbursed && isDateString(body.reimbursedDate)
        ? body.reimbursedDate
        : null;

    const entry: Document = {
      id: crypto.randomUUID(),
      fileId: null,
      filename: null,
      hasFile: false,
      user: isStringWithLimit(body.user, MAX_SHORT_TEXT) ? body.user.trim() : "",
      title:
        isStringWithLimit(body.title, MAX_SHORT_TEXT) && body.title.trim()
          ? body.title.trim()
          : "Untitled document",
      category:
        isStringWithLimit(body.category, MAX_SHORT_TEXT) ? body.category.trim() : "",
      date: isDateString(body.date)
        ? body.date
        : now.toISOString().slice(0, 10),
      amount: Math.round(amount * 100) / 100,
      notes: isStringWithLimit(body.notes, MAX_NOTES_TEXT) ? body.notes.trim() : "",
      reimbursed,
      reimbursedDate,
      createdAt: now.toISOString(),
      ocrConfidence: null
    };

    await readModifyWriteDocuments(accessToken, (data) => {
      data.documents.push(entry);
    });

    return NextResponse.json(entry);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to create document", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }
}
