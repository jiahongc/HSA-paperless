import type { NextRequest } from "next/server";
import type { JWT } from "next-auth/jwt";
import { getToken } from "next-auth/jwt";
import { ensureFreshAccessToken } from "./auth";

export type RequestAuth = {
  accessToken: string;
  name: string | null;
};

export async function getRequestAuth(
  request: NextRequest
): Promise<RequestAuth | null> {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  });

  if (!token) return null;

  const refreshed = await ensureFreshAccessToken(token as JWT);
  if (refreshed.error) return null;

  const accessToken = refreshed.accessToken;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    return null;
  }

  if (refreshed.expiresAt && Date.now() / 1000 >= refreshed.expiresAt - 5) {
    return null;
  }

  const name = typeof refreshed.name === "string" ? refreshed.name : null;
  return { accessToken, name };
}

export async function getAccessTokenFromRequest(
  request: NextRequest
): Promise<string | null> {
  const auth = await getRequestAuth(request);
  return auth?.accessToken ?? null;
}
