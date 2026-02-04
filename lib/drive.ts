import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import type { ReceiptsFile } from "../types/receipts";

const RECEIPTS_METADATA_NAME = "receipts.json";

function getDrive(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

async function getOrCreateMetadataFileId(drive: drive_v3.Drive) {
  const list = await drive.files.list({
    spaces: "appDataFolder",
    q: `name = '${RECEIPTS_METADATA_NAME}' and trashed = false`,
    fields: "files(id, name)"
  });

  const existing = list.data.files?.[0];
  if (existing?.id) {
    return existing.id;
  }

  const initialData: ReceiptsFile = {
    version: 1,
    receipts: []
  };

  const created = await drive.files.create({
    requestBody: {
      name: RECEIPTS_METADATA_NAME,
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

export async function readReceiptsFile(accessToken: string): Promise<ReceiptsFile> {
  const drive = getDrive(accessToken);
  const fileId = await getOrCreateMetadataFileId(drive);

  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  const raw = Buffer.from(response.data as ArrayBuffer).toString("utf-8");
  return JSON.parse(raw) as ReceiptsFile;
}

export async function writeReceiptsFile(
  accessToken: string,
  data: ReceiptsFile
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
