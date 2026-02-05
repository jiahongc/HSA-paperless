import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";
import { getDocumentFile, readDocumentsFile } from "../../../../../lib/drive";
import { isAuthError } from "../../../../../lib/errors";

function safeFilename(filename: string) {
  return filename.replace(/"/g, "");
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

    return new NextResponse(file.buffer, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${safeFilename(file.filename)}"`,
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
