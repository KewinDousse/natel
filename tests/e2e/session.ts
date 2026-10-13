import { type APIRequestContext, expect } from "@playwright/test";
import { APP_URL, PASSWORD, USER } from "./env";

/**
 * Opens a session with natel-session (ADR 032) from outside a browser and
 * returns the cookie that gets /dav requests through, as `name=value`.
 */
export async function openSession(
  origin: string,
  username: string,
  password: string,
): Promise<string> {
  const response = await fetch(`${origin}/session`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status).toBe(200);
  await response.text();
  const cookie = /^natel_session=[^;]+/.exec(response.headers.get("set-cookie") ?? "")?.[0];
  if (!cookie) throw new Error("No session cookie");
  return cookie;
}

/** Signs a request context in as the test user: its cookie jar keeps the session. */
export async function signIn(request: APIRequestContext): Promise<void> {
  const response = await request.post("/session", {
    headers: { Origin: APP_URL },
    data: { username: USER, password: PASSWORD },
  });
  expect(response.status()).toBe(200);
}
