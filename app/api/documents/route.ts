import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { readDocumentsFile, writeDocumentsFile } from "../../../lib/drive";
import type { Document, DocumentsFile } from "../../../types/documents";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await readDocumentsFile(session.accessToken);
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as DocumentsFile;
  await writeDocumentsFile(session.accessToken, body);

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<Document>;
  const data = await readDocumentsFile(session.accessToken);

  const now = new Date();
  const entry: Document = {
    id: body.id ?? crypto.randomUUID(),
    fileId: body.fileId ?? null,
    filename: body.filename ?? null,
    hasFile: body.hasFile ?? false,
    title: body.title?.trim() || "Untitled document",
    merchant: body.merchant ?? "",
    category: body.category ?? "",
    date: body.date ?? now.toISOString().slice(0, 10),
    amount: typeof body.amount === "number" ? body.amount : 0,
    notes: body.notes ?? "",
    reimbursed: body.reimbursed ?? false,
    reimbursedDate: body.reimbursedDate ?? null,
    createdAt: body.createdAt ?? now.toISOString(),
    ocrConfidence: body.ocrConfidence ?? null
  };

  data.documents = [...data.documents, entry];
  await writeDocumentsFile(session.accessToken, data);

  return NextResponse.json(entry);
}
