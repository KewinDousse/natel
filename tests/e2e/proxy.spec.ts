import { expect, test } from "@playwright/test";
import { PASSWORD, USER } from "./env";
import { signIn } from "./session";

test.skip(({ isMobile }) => isMobile, "the proxy doesn't depend on the viewport");

// Every path of the server is reachable under /dav, its admin included. The
// rest of the suite covers the methods the proxy relays.
test("refuses the methods the app never sends", async ({ request }) => {
  // OPTIONS is left out: Vite's preview answers it itself, and Caddy refuses it.
  for (const method of [
    "GET",
    "HEAD",
    "POST",
    "PROPPATCH",
    "MKCOL",
    "MOVE",
    "COPY",
    "LOCK",
    "PATCH",
  ]) {
    const response = await request.fetch("/dav/admin/", { method });
    expect(response.status(), method).toBe(405);
    expect(response.headers().allow, method).toBe("PROPFIND, REPORT, PUT, DELETE");
  }
});

// Through Caddy as through Vite's proxy, which mirrors it.
test("hides the server's software and version", async ({ request }) => {
  await signIn(request);
  const response = await request.fetch("/dav/", { method: "PROPFIND", headers: { Depth: "0" } });
  // Past the session, whatever the server answers at its root (Baïkal: 405).
  expect(response.status()).not.toBe(401);
  const headers = response.headers();
  // Caddy may name itself, without a version.
  expect([undefined, "Caddy"]).toContain(headers.server);
  expect(headers["x-powered-by"]).toBeUndefined();
});

// The session cookie is the only way to the server: a client's own
// credentials never reach it (ADR 032).
test("relays no request without a session", async ({ request }) => {
  const basic = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}`;
  const response = await request.fetch("/dav/", {
    method: "PROPFIND",
    headers: { Depth: "0", Authorization: basic },
  });
  expect(response.status()).toBe(401);
  expect(response.headers()["www-authenticate"]).toBeUndefined();
});

test("opens a session only for the app's own origin", async ({ request }) => {
  const response = await request.post("/session", {
    headers: { Origin: "https://elsewhere.example" },
    data: { username: USER, password: PASSWORD },
  });
  expect(response.status()).toBe(403);
  expect(response.headers()["set-cookie"]).toBeUndefined();
});
