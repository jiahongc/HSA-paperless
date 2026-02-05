import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { readDocumentsFile, uploadDocumentFile, writeDocumentsFile } from "../../../../lib/drive";
import { isAuthError } from "../../../../lib/errors";
import { runOcr } from "../../../../lib/ocr";
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

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "document";
}

function getExtension(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot) : "";
}

function buildFilename(date: string, title: string, ext: string, usedNames: Set<string>): string {
  const base = `${date}_${slugify(title)}${ext}`;
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }
  let counter = 1;
  while (true) {
    const candidate = `${date}_${slugify(title)}_${counter}${ext}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    counter++;
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((item) => item instanceof File) as File[];

  if (!files.length) {
    return NextResponse.json({ error: "No files" }, { status: 400 });
  }

  try {
    const data = await readDocumentsFile(session.accessToken);
    const createdEntries: Document[] = [];
    const usedNames = new Set(
      data.documents.map((doc) => doc.filename).filter(Boolean) as string[]
    );

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const now = new Date();
      const dateValue = now.toISOString().slice(0, 10);

      let ocr = { title: "", date: "", amount: 0, category: "", confidence: null as number | null };
      try {
        ocr = await runOcr(buffer, file.type || "application/octet-stream");
      } catch (error) {
        console.error("OCR failed for", file.name, error);
      }

      const title = ocr.title || titleFromFilename(file.name);
      const docDate = ocr.date || dateValue;
      const ext = getExtension(file.name);
      const driveFilename = buildFilename(docDate, title, ext, usedNames);

      const upload = await uploadDocumentFile(session.accessToken, {
        filename: driveFilename,
        mimeType: file.type || "application/octet-stream",
        buffer,
        folder: toMonthFolder(now)
      });

      const entry: Document = {
        id: crypto.randomUUID(),
        fileId: upload.fileId,
        filename: upload.filename,
        hasFile: true,
        user: getFirstName(session.user?.name),
        title,
        category: ocr.category,
        date: docDate,
        amount: ocr.amount,
        notes: "",
        reimbursed: false,
        reimbursedDate: null,
        createdAt: now.toISOString(),
        ocrConfidence: ocr.confidence
      };

      data.documents.push(entry);
      createdEntries.push(entry);
    }

    await writeDocumentsFile(session.accessToken, data);

    return NextResponse.json({ entries: createdEntries });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to upload documents", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }
}
