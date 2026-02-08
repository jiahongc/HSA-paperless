import { NextRequest, NextResponse } from "next/server";
import {
  deleteDocumentFile,
  readModifyWriteDocuments,
  uploadDocumentFile
} from "../../../../lib/drive";
import { isAuthError } from "../../../../lib/errors";
import { runOcr } from "../../../../lib/ocr";
import { getRequestAuth } from "../../../../lib/server-auth";
import type { Document } from "../../../../types/documents";

function toMonthFolder(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || "";
}

function titleFromFilename(filename: string) {
  const trimmed = filename.replace(/\.[^/.]+$/, "");
  return trimmed || "Untitled document";
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

function deduplicateFilename(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const ext = dot >= 0 ? name.slice(dot) : "";
  let counter = 1;
  while (true) {
    const candidate = `${base}_${counter}${ext}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    counter++;
  }
}

async function rollbackUploads(accessToken: string, entries: Document[]) {
  const fileIds = entries
    .map((entry) => entry.fileId)
    .filter((fileId): fileId is string => Boolean(fileId));

  await Promise.allSettled(
    fileIds.map(async (fileId) => {
      try {
        await deleteDocumentFile(accessToken, fileId);
      } catch (error) {
        console.error("Rollback failed for file", fileId, error);
      }
    })
  );
}

export async function POST(request: NextRequest) {
  const auth = await getRequestAuth(request);
  if (!auth?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((item) => item instanceof File) as File[];

  if (!files.length) {
    return NextResponse.json({ error: "No files" }, { status: 400 });
  }

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds the 10 MB size limit` },
        { status: 400 }
      );
    }
    const mime = file.type.toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json(
        {
          error: `File "${file.name}" has unsupported type "${file.type}". Accepted: JPG, PNG, WebP, PDF`
        },
        { status: 400 }
      );
    }
  }

  const createdEntries: Document[] = [];
  let metadataCommitted = false;

  try {
    // Process files and upload to Drive before acquiring the write lock
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const now = new Date();
      const dateValue = now.toISOString().slice(0, 10);

      let ocr = {
        title: "",
        date: "",
        amount: 0,
        category: "",
        confidence: null as number | null
      };
      try {
        ocr = await runOcr(buffer, file.type || "application/octet-stream");
      } catch (error) {
        console.error("OCR failed for", file.name, error);
      }

      const title = ocr.title || titleFromFilename(file.name);
      const docDate = /^\d{4}-\d{2}-\d{2}$/.test(ocr.date) ? ocr.date : dateValue;

      const upload = await uploadDocumentFile(auth.accessToken, {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        buffer,
        folder: toMonthFolder(now)
      });

      createdEntries.push({
        id: crypto.randomUUID(),
        fileId: upload.fileId,
        filename: upload.filename,
        hasFile: true,
        user: getFirstName(auth.name),
        title,
        category: ocr.category,
        date: docDate,
        amount: Number.isFinite(ocr.amount) && ocr.amount >= 0 ? ocr.amount : 0,
        notes: "",
        reimbursed: false,
        reimbursedDate: null,
        createdAt: now.toISOString(),
        ocrConfidence: ocr.confidence
      });
    }

    // Use the write lock to safely append new entries to documents.json
    await readModifyWriteDocuments(auth.accessToken, (data) => {
      const usedNames = new Set(
        data.documents.map((doc) => doc.filename).filter(Boolean) as string[]
      );
      for (const entry of createdEntries) {
        if (entry.filename) {
          entry.filename = deduplicateFilename(entry.filename, usedNames);
        }
        data.documents.push(entry);
      }
    });
    metadataCommitted = true;

    return NextResponse.json({ entries: createdEntries });
  } catch (error) {
    if (!metadataCommitted && createdEntries.length > 0) {
      await rollbackUploads(auth.accessToken, createdEntries);
    }

    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to upload documents", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }
}
