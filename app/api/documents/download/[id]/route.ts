import { NextRequest, NextResponse } from "next/server";
import { getDocumentFile, readDocumentsFile } from "../../../../../lib/drive";
import { isAuthError } from "../../../../../lib/errors";
import { getAccessTokenFromRequest } from "../../../../../lib/server-auth";

function safeFilename(filename: string) {
  return filename.replace(/["\r\n\\]/g, "");
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const accessToken = await getAccessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await readDocumentsFile(accessToken);
    const entry = data.documents.find((document) => document.id === params.id);

    if (!entry || !entry.hasFile || !entry.fileId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const file = await getDocumentFile(accessToken, entry.fileId);

    return new NextResponse(file.buffer, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `attachment; filename="${safeFilename(file.filename)}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=0, no-store"
      }
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to download document file", error);
    return NextResponse.json({ error: "DriveError" }, { status: 500 });
  }
}
