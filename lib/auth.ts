import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

// Guard against concurrent token refreshes: one in-flight refresh per user
const refreshPromises = new Map<string, Promise<JWT>>();

async function refreshAccessToken(token: JWT): Promise<JWT> {
  const key = token.sub ?? "default";
  const existing = refreshPromises.get(key);
  if (existing) return existing;
  const promise = doRefreshAccessToken(token).finally(() => {
    refreshPromises.delete(key);
  });
  refreshPromises.set(key, promise);
  return promise;
}

async function doRefreshAccessToken(token: JWT) {
  if (!token.refreshToken) {
    return { ...token, error: "MissingRefreshToken" };
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: token.refreshToken
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });

  const refreshed = await response.json();

  if (!response.ok) {
    return { ...token, error: "RefreshAccessTokenError" };
  }

  return {
    ...token,
    accessToken: refreshed.access_token,
    expiresAt: Math.floor(Date.now() / 1000 + refreshed.expires_in),
    refreshToken: refreshed.refresh_token ?? token.refreshToken
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: `openid email profile ${DRIVE_SCOPE}`
        }
      }
    })
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at ?? Math.floor(Date.now() / 1000 + 3600)
        };
      }

      if (token.expiresAt && Date.now() / 1000 < token.expiresAt - 60) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    }
  }
};
