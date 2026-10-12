import { createConnection } from "node:net";
import { expect, test } from "@playwright/test";
import { BOOK_PATH, resetBook } from "./dav";
import { APP_URL, PASSWORD, USER } from "./env";

function stalledRequest(request: string): Promise<number> {
  const app = new URL(APP_URL);
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const socket = createConnection({ host: app.hostname, port: Number(app.port) }, () => {
      socket.write(request);
    });
    socket.setTimeout(80_000, () => {
      socket.destroy();
      reject(new Error("The stalled HTTP connection remained open"));
    });
    socket.on("data", () => {
      resolve(performance.now() - started);
      socket.destroy();
    });
    socket.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "ECONNRESET") reject(error);
    });
    socket.on("close", () => resolve(performance.now() - started));
  });
}

test("bounds stalled headers and an upload with Connection close", async ({ isMobile }) => {
  test.skip(isMobile, "HTTP deadlines don't depend on the viewport");
  test.skip(process.env.E2E_EXTERNAL_APP !== "1", "Caddy enforces the HTTP read deadlines");
  test.setTimeout(90_000);
  await resetBook();
  const host = new URL(APP_URL).host;
  const authorization = Buffer.from(`${USER}:${PASSWORD}`).toString("base64");
  const [headersElapsed, uploadElapsed] = await Promise.all([
    stalledRequest(`PROPFIND /dav/ HTTP/1.1\r\nHost: ${host}\r\nX-Stalled: `),
    stalledRequest(
      `PUT /dav${BOOK_PATH}stalled-upload.vcf HTTP/1.1\r\nHost: ${host}\r\nAuthorization: Basic ${authorization}\r\nConnection: close\r\nIf-None-Match: *\r\nContent-Length: 1000\r\n\r\nBEGIN:VCARD`,
    ),
  ]);
  expect(headersElapsed).toBeGreaterThanOrEqual(55_000);
  expect(headersElapsed).toBeLessThan(75_000);
  // The upstream can reject an incomplete upload before Caddy's idle deadline.
  expect(uploadElapsed).toBeLessThan(75_000);
});
