import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";
import { getDocumentFile, readDocumentsFile } from "../../../../../lib/drive";
import { isAuthError } from "../../../../../lib/errors";

const SAFE_INLINE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

function safeFilename(filename: string) {
  return filename.replace(/["\r\n\\]/g, "");
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await readDocumentsFile(session.accessToken);
    const entry = data.documents.find((document) => document.id === params.id);

    if (!entry || !entry.hasFile || !entry.fileId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const file = await getDocumentFile(session.accessToken, entry.fileId);

    // Only allow safe MIME types for inline rendering; force download for anything else
    const contentType = SAFE_INLINE_TYPES.has(file.mimeType)
      ? file.mimeType
      : "application/octet-stream";
    const disposition = SAFE_INLINE_TYPES.has(file.mimeType)
      ? `inline; filename="${safeFilename(file.filename)}"`
      : `attachment; filename="${safeFilename(file.filename)}"`;

    return new NextResponse(file.buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=0, no-store"
      }
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to load document file", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }
}
