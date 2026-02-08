import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { PassThrough } from "stream";
import { readDocumentsFile, getDocumentFile } from "../../../../lib/drive";
import { isAuthError } from "../../../../lib/errors";
import { getAccessTokenFromRequest } from "../../../../lib/server-auth";

function sanitizeArchiveEntryName(name: string, fallback: string) {
  const basename = name.split(/[\\/]/).pop() ?? fallback;
  const clean = basename
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/^\.+/, "")
    .trim();

  return clean || fallback;
}

export async function GET(request: NextRequest) {
  const accessToken = await getAccessTokenFromRequest(request);
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await readDocumentsFile(accessToken);
    const documentsWithFiles = data.documents.filter(
      (doc) => doc.hasFile && doc.fileId
    );

    if (documentsWithFiles.length === 0) {
      return NextResponse.json(
        { error: "No documents with files to export" },
        { status: 400 }
      );
    }

    const passThrough = new PassThrough();
    const archive = archiver("zip", { zlib: { level: 5 } });

    archive.pipe(passThrough);

    const MAX_EXPORT_BYTES = 50 * 1024 * 1024; // 50 MB cap
    let totalBytes = 0;
    const usedNames = new Set<string>();
    for (const doc of documentsWithFiles) {
      try {
        const file = await getDocumentFile(accessToken, doc.fileId!);
        let filename = sanitizeArchiveEntryName(
          doc.filename || file.filename || `${doc.id}.bin`,
          `${doc.id}.bin`
        );
        if (usedNames.has(filename)) {
          const ext = filename.lastIndexOf(".");
          const base = ext > 0 ? filename.slice(0, ext) : filename;
          const suffix = ext > 0 ? filename.slice(ext) : "";
          let counter = 1;
          while (usedNames.has(`${base}_${counter}${suffix}`)) counter++;
          filename = `${base}_${counter}${suffix}`;
        }
        usedNames.add(filename);
        totalBytes += file.buffer.length;
        if (totalBytes > MAX_EXPORT_BYTES) {
          console.warn("Export size cap reached, skipping remaining files");
          break;
        }
        archive.append(file.buffer, { name: filename });
      } catch (error) {
        console.error(`Failed to fetch file for document ${doc.id}`, error);
      }
    }

    await archive.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of passThrough) {
      chunks.push(chunk as Buffer);
    }
    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=HSA_Documents.zip"
      }
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "InvalidCredentials" }, { status: 401 });
    }
    console.error("Failed to export documents", error);
    return NextResponse.json({ error: "ExportError" }, { status: 500 });
  }
}
