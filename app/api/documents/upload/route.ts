import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { readDocumentsFile, uploadDocumentFile, writeDocumentsFile } from "../../../../lib/drive";
import { isAuthError } from "../../../../lib/errors";
import type { Document } from "../../../../types/documents";

function toMonthFolder(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function titleFromFilename(filename: string) {
  const trimmed = filename.replace(/\.[^/.]+$/, "");
  return trimmed || "Untitled document";
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

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const now = new Date();
      const dateValue = now.toISOString().slice(0, 10);
      const upload = await uploadDocumentFile(session.accessToken, {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        buffer,
        folder: toMonthFolder(now)
      });

      const entry: Document = {
        id: crypto.randomUUID(),
        fileId: upload.fileId,
        filename: upload.filename,
        hasFile: true,
        title: titleFromFilename(file.name),
        merchant: "",
        category: "",
        date: dateValue,
        amount: 0,
        notes: "",
        reimbursed: false,
        reimbursedDate: null,
        createdAt: now.toISOString(),
        ocrConfidence: null
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
