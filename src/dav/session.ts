/**
 * Sign-in sessions, held by natel-session behind the same origin (ADR 032).
 *
 * The password goes out once, to open the session; natel-session checks it
 * against the CardDAV server and answers with an HttpOnly cookie that page
 * scripts never see. Every /dav request then carries that cookie.
 */
import type { DavAuth, DavCredentials } from "./types";
import { DavError } from "./types";

function sessionUrl(): string {
  return new URL("/session", globalThis.location.href).href;
}

/**
 * Under the page's no-referrer policy, a browser may send `Origin: null` on
 * a POST or DELETE; this request's own policy lets it name the page.
 */
const SAME_ORIGIN = { mode: "same-origin", referrerPolicy: "same-origin" } as const;

/** Status codes for a CardDAV server that can't be reached, at the proxy. */
const UNREACHABLE = new Set([502, 503, 504]);

/**
 * Open a session. Throws DavError AUTH when the server rejects the
 * credentials, NETWORK when it can't be reached.
 */
export async function openSession(credentials: DavCredentials): Promise<DavAuth> {
  let response: Response;
  try {
    response = await fetch(sessionUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
      ...SAME_ORIGIN,
    });
  } catch (err) {
    throw new DavError("Session: network error opening it", "NETWORK", err);
  }
  if (!response.ok) {
    await discard(response);
    if (response.status === 401) {
      throw new DavError("CardDAV authentication failed: opening a session", "AUTH", response);
    }
    if (UNREACHABLE.has(response.status)) {
      throw new DavError(
        `Session: server unreachable (HTTP ${response.status})`,
        "NETWORK",
        response,
      );
    }
    throw new DavError(`Session: HTTP ${response.status} opening it`, "UNEXPECTED", response);
  }
  return readAuth(response);
}

/** The session this browser already has, or null when there is none. */
export async function currentSession(): Promise<DavAuth | null> {
  try {
    const response = await fetch(sessionUrl(), { ...SAME_ORIGIN, cache: "no-store" });
    if (!response.ok) {
      await discard(response);
      return null;
    }
    return await readAuth(response);
  } catch {
    return null;
  }
}

/**
 * End the session on the server. False when the server didn't confirm it:
 * the cookie is out of the app's reach, so the session is still open.
 */
export async function closeSession(): Promise<boolean> {
  try {
    const response = await fetch(sessionUrl(), { method: "DELETE", ...SAME_ORIGIN });
    await discard(response);
    return response.ok;
  } catch {
    return false;
  }
}

/** An unread body keeps the request open in the browser. */
async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {});
}

async function readAuth(response: Response): Promise<DavAuth> {
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("username" in body) ||
    typeof body.username !== "string"
  ) {
    throw new DavError("Session: unexpected answer", "UNEXPECTED");
  }
  return { username: body.username };
}
