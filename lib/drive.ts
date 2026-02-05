import { Readable } from "node:stream";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import type { DocumentsFile } from "../types/documents";

const DOCUMENTS_METADATA_NAME = "documents.json";
const DOCUMENTS_FOLDER_NAME = "documents";

function getDrive(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

async function getOrCreateChildFolderId(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string
) {
  const parentQuery = parentId ? ` and '${parentId}' in parents` : "";
  const list = await drive.files.list({
    spaces: "appDataFolder",
    q: `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentQuery}`,
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

export async function readDocumentsFile(accessToken: string): Promise<DocumentsFile> {
  const drive = getDrive(accessToken);
  const fileId = await getOrCreateMetadataFileId(drive);

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  const raw = Buffer.from(response.data as ArrayBuffer).toString("utf-8");
  const parsed = JSON.parse(raw) as DocumentsFile & { receipts?: DocumentsFile["documents"] };
  if (!parsed.documents && parsed.receipts) {
    return { version: parsed.version ?? 1, documents: parsed.receipts };
  }
  return parsed;
}

export async function writeDocumentsFile(
  accessToken: string,
  data: DocumentsFile
) {
  const drive = getDrive(accessToken);
  const fileId = await getOrCreateMetadataFileId(drive);

  await drive.files.update({
    fileId,
    media: {
      mimeType: "application/json",
      body: JSON.stringify(data)
    }
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
