import { NextRequest, NextResponse } from "next/server";
import {
  deleteDocumentFile,
  readModifyWriteDocuments
} from "../../../../lib/drive";
import { isAuthError } from "../../../../lib/errors";
import { getAccessTokenFromRequest } from "../../../../lib/server-auth";
import type { Document } from "../../../../types/documents";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 1_000_000;
const MAX_SHORT_TEXT = 200;
const MAX_NOTES_TEXT = 5000;

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

function isDateString(value: unknown): value is string {
  return typeof value === "string" && DATE_REGEX.test(value);
}

function sanitizeUpdates(body: Partial<Document>) {
  const updates: DocumentUpdates = {};

  if (typeof body.user === "string" && body.user.length <= MAX_SHORT_TEXT) {
    updates.user = body.user.trim();
  }
  if (typeof body.title === "string" && body.title.length <= MAX_SHORT_TEXT) {
    updates.title = body.title.trim() || "Untitled document";
  }
  if (typeof body.category === "string" && body.category.length <= MAX_SHORT_TEXT) {
    updates.category = body.category.trim();
  }
  if (isDateString(body.date)) {
    updates.date = body.date;
  }
  if (
    typeof body.amount === "number" &&
    Number.isFinite(body.amount) &&
    body.amount >= 0 &&
    body.amount <= MAX_AMOUNT
  ) {
    updates.amount = Math.round(body.amount * 100) / 100;
  }
  if (typeof body.notes === "string" && body.notes.length <= MAX_NOTES_TEXT) {
    updates.notes = body.notes.trim();
  }
  if (typeof body.reimbursed === "boolean") {
    updates.reimbursed = body.reimbursed;
  }
  if ("reimbursedDate" in body) {
    if (body.reimbursedDate === null || body.reimbursedDate === "") {
      updates.reimbursedDate = null;
    } else if (isDateString(body.reimbursedDate)) {
      updates.reimbursedDate = body.reimbursedDate;
    }
  }

  if (updates.reimbursed === false && !("reimbursedDate" in updates)) {
    updates.reimbursedDate = null;
  }

  return updates;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    let updated: Document | null = null;

    await readModifyWriteDocuments(accessToken, (data) => {
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
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const accessToken = await getAccessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let removed: Document | null = null;

    await readModifyWriteDocuments(accessToken, (data) => {
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
        await deleteDocumentFile(accessToken, doc.fileId);
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
