import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { readDocumentsFile, writeDocumentsFile, readModifyWriteDocuments } from "../../../lib/drive";

import { isAuthError } from "../../../lib/errors";
import type { Document, DocumentsFile } from "../../../types/documents";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await readDocumentsFile(session.accessToken);
    return NextResponse.json(data);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to load documents", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as unknown;

    if (
      !body ||
      typeof body !== "object" ||
      !("documents" in body) ||
      !Array.isArray((body as DocumentsFile).documents)
    ) {
      return NextResponse.json(
        { error: "Invalid data: must include a documents array" },
        { status: 400 }
      );
    }

    const validated: DocumentsFile = {
      version: (body as DocumentsFile).version ?? 1,
      documents: (body as DocumentsFile).documents
    };

    await writeDocumentsFile(session.accessToken, validated);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to update documents", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<Document>;

    const now = new Date();
    const entry: Document = {
      id: crypto.randomUUID(),
      fileId: body.fileId ?? null,
      filename: body.filename ?? null,
      hasFile: body.hasFile ?? false,
      user: body.user ?? "",
      title: body.title?.trim() || "Untitled document",
      category: body.category ?? "",
      date: body.date ?? now.toISOString().slice(0, 10),
      amount: typeof body.amount === "number" ? body.amount : 0,
      notes: body.notes ?? "",
      reimbursed: body.reimbursed ?? false,
      reimbursedDate: body.reimbursedDate ?? null,
      createdAt: now.toISOString(),
      ocrConfidence: body.ocrConfidence ?? null
    };

    await readModifyWriteDocuments(session.accessToken, (data) => {
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
