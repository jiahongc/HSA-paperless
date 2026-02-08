import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import type { DocumentsFile } from "../types/documents";

const DOCUMENTS_METADATA_NAME = "documents.json";
const DOCUMENTS_FOLDER_NAME = "documents";
const WRITE_RETRY_LIMIT = 4;

// In-process write lock keeps a single instance consistent. Cross-instance
// protection is handled with optimistic writes via Drive ETag preconditions.
// Keyed by access token so different users don't block each other.
const writeLocks = new Map<string, Promise<void>>();

async function withWriteLock<T>(accessToken: string, fn: () => Promise<T>): Promise<T> {
  const key = createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
  const prev = writeLocks.get(key) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  writeLocks.set(key, next);
  try {
    await prev;
    return await fn();
  } finally {
    resolve!();
    if (writeLocks.get(key) === next) {
      writeLocks.delete(key);
    }
  }
}

function getDrive(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

type DocumentsFileState = {
  fileId: string;
  data: DocumentsFile;
  etag: string | null;
};

function extractEtag(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].length > 0) {
    return value[0];
  }
  return null;
}

function isWriteConflictError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: number; response?: { status?: number } };
  const status = maybeError.code ?? maybeError.response?.status;
  return status === 409 || status === 412;
}

function parseDocumentsFile(raw: string): DocumentsFile {
  const empty: DocumentsFile = { version: 1, documents: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }

  if (!parsed || typeof parsed !== "object") {
    return empty;
  }

  const typed = parsed as DocumentsFile & { receipts?: DocumentsFile["documents"] };
  const documents = Array.isArray(typed.documents)
    ? typed.documents
    : Array.isArray(typed.receipts)
      ? typed.receipts
      : [];
  const version =
    typeof typed.version === "number" && Number.isInteger(typed.version) && typed.version > 0
      ? typed.version
      : 1;

  return { version, documents };
}

async function getOrCreateChildFolderId(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string
) {
  const safeName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const parentQuery = parentId ? ` and '${parentId}' in parents` : "";
  const list = await drive.files.list({
    spaces: "appDataFolder",
    q: `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentQuery}`,
    fields: "files(id, name)"
  });

  const existing = list.data.files?.[0];
  if (existing?.id) {
    return existing.id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId ?? "appDataFolder"]
    },
    fields: "id"
  });

  return created.data.id as string;
}

async function getOrCreateMetadataFileId(drive: drive_v3.Drive) {
  const list = await drive.files.list({
    spaces: "appDataFolder",
    q: `name = '${DOCUMENTS_METADATA_NAME}' and trashed = false`,
    fields: "files(id, name)"
  });

  const existing = list.data.files?.[0];
  if (existing?.id) {
    return existing.id;
  }

  const legacyList = await drive.files.list({
    spaces: "appDataFolder",
    q: "name = 'receipts.json' and trashed = false",
    fields: "files(id, name)"
  });

  const legacy = legacyList.data.files?.[0];
  if (legacy?.id) {
    await drive.files.update({
      fileId: legacy.id,
      requestBody: { name: DOCUMENTS_METADATA_NAME }
    });
    return legacy.id;
  }

  const initialData: DocumentsFile = {
    version: 1,
    documents: []
  };

  const created = await drive.files.create({
    requestBody: {
      name: DOCUMENTS_METADATA_NAME,
      parents: ["appDataFolder"]
    },
    media: {
      mimeType: "application/json",
      body: JSON.stringify(initialData)
    },
    fields: "id"
  });

  return created.data.id as string;
}

async function readDocumentsFileState(
  drive: drive_v3.Drive
): Promise<DocumentsFileState> {
  const fileId = await getOrCreateMetadataFileId(drive);
  const metadataResponse = await drive.files.get({
    fileId,
    fields: "id, version"
  });
  const metadataEtag =
    extractEtag(metadataResponse.headers?.etag) ||
    extractEtag((metadataResponse.data as { etag?: string }).etag);

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  const raw = Buffer.from(response.data as ArrayBuffer).toString("utf-8");
  return {
    fileId,
    data: parseDocumentsFile(raw),
    etag: metadataEtag || extractEtag(response.headers?.etag)
  };
}

async function writeDocumentsFileState(
  drive: drive_v3.Drive,
  fileId: string,
  data: DocumentsFile,
  etag: string | null
) {
  await drive.files.update(
    {
      fileId,
      media: {
        mimeType: "application/json",
        body: JSON.stringify(data)
      }
    },
    etag
      ? {
          headers: {
            "If-Match": etag
          }
        }
      : undefined
  );
}

export async function readDocumentsFile(accessToken: string): Promise<DocumentsFile> {
  const drive = getDrive(accessToken);
  const state = await readDocumentsFileState(drive);
  return state.data;
}

export async function writeDocumentsFile(
  accessToken: string,
  data: DocumentsFile
) {
  return withWriteLock(accessToken, async () => {
    const drive = getDrive(accessToken);

    for (let attempt = 0; attempt < WRITE_RETRY_LIMIT; attempt++) {
      const state = await readDocumentsFileState(drive);
      try {
        await writeDocumentsFileState(drive, state.fileId, data, state.etag);
        return;
      } catch (error) {
        if (!isWriteConflictError(error)) {
          throw error;
        }
        if (attempt === WRITE_RETRY_LIMIT - 1) {
          throw error;
        }
      }
    }
  });
}

/**
 * Safely read, modify, and write documents.json under a per-user write lock
 * to prevent concurrent read-modify-write races.
 */
export async function readModifyWriteDocuments(
  accessToken: string,
  modify: (data: DocumentsFile) => DocumentsFile | void
): Promise<DocumentsFile> {
  return withWriteLock(accessToken, async () => {
    const drive = getDrive(accessToken);

    for (let attempt = 0; attempt < WRITE_RETRY_LIMIT; attempt++) {
      const state = await readDocumentsFileState(drive);
      const working: DocumentsFile = {
        version: state.data.version,
        documents: [...state.data.documents]
      };

      const result = modify(working);
      const final = result ?? working;

      try {
        await writeDocumentsFileState(drive, state.fileId, final, state.etag);
        return final;
      } catch (error) {
        if (!isWriteConflictError(error)) {
          throw error;
        }
        if (attempt === WRITE_RETRY_LIMIT - 1) {
          throw error;
        }
      }
    }

    throw new Error("Exceeded write retries");
  });
}

export async function uploadDocumentFile(
  accessToken: string,
  {
    filename,
    mimeType,
    buffer,
    folder
  }: {
    filename: string;
    mimeType: string;
    buffer: Buffer;
    folder: string;
  }
) {
  const drive = getDrive(accessToken);
  const documentsFolderId = await getOrCreateChildFolderId(
    drive,
    DOCUMENTS_FOLDER_NAME
  );
  const monthFolderId = await getOrCreateChildFolderId(
    drive,
    folder,
    documentsFolderId
  );

  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [monthFolderId]
    },
    media: {
      mimeType,
      body: Readable.from(buffer)
    },
    fields: "id, name"
  });

  return {
    fileId: created.data.id as string,
    filename: created.data.name as string
  };
}

export async function getDocumentFile(accessToken: string, fileId: string) {
  const drive = getDrive(accessToken);
  const metadata = await drive.files.get({
    fileId,
    fields: "name, mimeType"
  });

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  return {
    filename: metadata.data.name ?? "document",
    mimeType: metadata.data.mimeType ?? "application/octet-stream",
    buffer: Buffer.from(response.data as ArrayBuffer)
  };
}

export async function deleteDocumentFile(accessToken: string, fileId: string) {
  const drive = getDrive(accessToken);
  await drive.files.delete({ fileId });
}
