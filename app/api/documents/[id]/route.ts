import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import {
  deleteDocumentFile,
  readModifyWriteDocuments
} from "../../../../lib/drive";
import { isAuthError } from "../../../../lib/errors";
import type { Document } from "../../../../types/documents";

type DocumentUpdates = Partial<
  Pick<
    Document,
    | "user"
    | "title"
    | "category"
    | "date"
    | "amount"
    | "notes"
    | "reimbursed"
    | "reimbursedDate"
  >
>;

function sanitizeUpdates(body: Partial<Document>) {
  const updates: DocumentUpdates = {};

  if (typeof body.user === "string") {
    updates.user = body.user.trim();
  }
  if (typeof body.title === "string") {
    updates.title = body.title.trim() || "Untitled document";
  }
  if (typeof body.category === "string") {
    updates.category = body.category.trim();
  }
  if (typeof body.date === "string") {
    updates.date = body.date;
  }
  if (typeof body.amount === "number" && Number.isFinite(body.amount)) {
    updates.amount = body.amount;
  }
  if (typeof body.notes === "string") {
    updates.notes = body.notes.trim();
  }
  if (typeof body.reimbursed === "boolean") {
    updates.reimbursed = body.reimbursed;
  }
  if ("reimbursedDate" in body) {
    updates.reimbursedDate = body.reimbursedDate ? body.reimbursedDate : null;
  }

  if (updates.reimbursed === false && !("reimbursedDate" in updates)) {
    updates.reimbursedDate = null;
  }

  return updates;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<Document>;
    let updated: Document | null = null;

    await readModifyWriteDocuments(session.accessToken, (data) => {
      const index = data.documents.findIndex((document) => document.id === params.id);
      if (index === -1) return;
      const existing = data.documents[index];
      const updates = sanitizeUpdates(body);
      updated = { ...existing, ...updates };
      data.documents[index] = updated;
    });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to update document", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let removed: Document | null = null;

    await readModifyWriteDocuments(session.accessToken, (data) => {
      const index = data.documents.findIndex((document) => document.id === params.id);
      if (index === -1) return;
      [removed] = data.documents.splice(index, 1);
    });

    if (!removed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const doc = removed as Document;
    if (doc.hasFile && doc.fileId) {
      try {
        await deleteDocumentFile(session.accessToken, doc.fileId);
      } catch (error) {
        console.error("Failed to delete document file", error);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to delete document", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }
}
