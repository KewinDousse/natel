import { createConnection } from "node:net";
import { expect, test } from "@playwright/test";
import { BOOK_PATH, resetBook } from "./dav";
import { APP_URL, PASSWORD, SERVER_NAME, USER } from "./env";
import { openSession } from "./session";

function stalledRequest(request: string): Promise<{ elapsed: number; statusLine: string }> {
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
    socket.on("data", (chunk: Buffer) => {
      resolve({
        elapsed: performance.now() - started,
        statusLine: chunk.toString("latin1").split("\r\n")[0] ?? "",
      });
      socket.destroy();
    });
    socket.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "ECONNRESET") reject(error);
    });
    socket.on("close", () => resolve({ elapsed: performance.now() - started, statusLine: "" }));
  });
}

async function stalledUpload(host: string): Promise<{ elapsed: number; statusLine: string }> {
  await resetBook();
  const cookie = await openSession(APP_URL, USER, PASSWORD);
  return stalledRequest(
    `PUT /dav${BOOK_PATH}stalled-upload.vcf HTTP/1.1\r\nHost: ${host}\r\nCookie: ${cookie}\r\nIf-None-Match: *\r\nContent-Length: 1000\r\n\r\nBEGIN:VCARD`,
  );
}

test("bounds stalled headers, and a kept-alive upload on Radicale", async ({ isMobile }) => {
  test.skip(isMobile, "HTTP deadlines don't depend on the viewport");
  test.skip(process.env.E2E_EXTERNAL_APP !== "1", "Caddy enforces the HTTP read deadlines");
  test.setTimeout(90_000);
  const host = new URL(APP_URL).host;
  // Radicale answers a stalled upload with 408. Others may close without
  // answering, which leaves the upload to Caddy's ten-minute budget:
  // upload-timeout.spec.ts runs that on a short clock.
  const [headers, upload] = await Promise.all([
    stalledRequest(`PROPFIND /dav/ HTTP/1.1\r\nHost: ${host}\r\nX-Stalled: `),
    SERVER_NAME === "radicale" ? stalledUpload(host) : undefined,
  ]);
  expect(headers.elapsed).toBeGreaterThanOrEqual(55_000);
  expect(headers.elapsed).toBeLessThan(75_000);
  if (upload) {
    expect(upload.statusLine).toBe("HTTP/1.1 408 Request Timeout");
    expect(upload.elapsed).toBeLessThan(75_000);
  }
});
