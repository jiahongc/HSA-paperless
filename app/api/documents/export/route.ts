import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import archiver from "archiver";
import { PassThrough } from "stream";
import { authOptions } from "../../../../lib/auth";
import { readDocumentsFile, getDocumentFile } from "../../../../lib/drive";
import { isAuthError } from "../../../../lib/errors";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await readDocumentsFile(session.accessToken);
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
        const file = await getDocumentFile(session.accessToken, doc.fileId!);
        let filename = doc.filename || file.filename || `${doc.id}.bin`;
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
