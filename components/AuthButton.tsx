"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <button className="rounded-full bg-ink px-4 py-2 text-white shadow-soft">
        Loading...
      </button>
    );
  }

  if (session) {
    return (
      <button
        className="rounded-full bg-ink px-4 py-2 text-white shadow-soft"
        onClick={() => signOut()}
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      className="rounded-full bg-ink px-4 py-2 text-white shadow-soft"
      onClick={() => signIn("google", { callbackUrl: "/" })}
    >
      Sign in with Google
    </button>
  );
}
