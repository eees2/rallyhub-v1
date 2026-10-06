// Server-only helpers for the RallyHub anonymous browser identifier.
// The browser_id is issued as an httpOnly, signed cookie on first server
// interaction and never exposed to client JS. It scopes likes and reports
// so a single browser cannot double-vote or spam.

import { useSession } from "@tanstack/react-start/server";
import { BROWSER_ID_COOKIE } from "./constants";

interface BrowserIdSession {
  browserId?: string;
}

function getSessionConfig() {
  const password = process.env.BROWSER_ID_SECRET;
  if (!password || password.length < 32) {
    throw new Error("BROWSER_ID_SECRET is missing or too short.");
  }
  return {
    password,
    name: BROWSER_ID_COOKIE,
    maxAge: 60 * 60 * 24 * 365, // 1 year
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

// Reads the caller's browser_id, minting a new one on first call and
// persisting it to the signed cookie. Returns the current identifier.
export async function ensureBrowserId(): Promise<string> {
  const session = await useSession<BrowserIdSession>(getSessionConfig());
  if (session.data.browserId) return session.data.browserId;

  const newId = crypto.randomUUID();
  await session.update({ browserId: newId });
  return newId;
}

// Same as ensureBrowserId but does not mint one — used for read paths
// where we want to know the caller's likes without side-effecting.
export async function getBrowserIdIfPresent(): Promise<string | null> {
  const session = await useSession<BrowserIdSession>(getSessionConfig());
  return session.data.browserId ?? null;
}