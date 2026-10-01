import { expect, test } from "@playwright/test";

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
