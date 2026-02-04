import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { readReceiptsFile, writeReceiptsFile } from "../../../lib/drive";
import type { ReceiptsFile } from "../../../types/receipts";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await readReceiptsFile(session.accessToken);
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ReceiptsFile;
  await writeReceiptsFile(session.accessToken, body);

  return NextResponse.json({ ok: true });
}
