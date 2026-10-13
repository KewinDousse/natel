import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP port");
  return address.port;
}

type LogEntry = {
  logger?: string;
  level: string;
  msg: string;
  ts: number;
  request?: { method: string };
  status?: number;
  duration?: number;
};

test("logs DAV status and timing without private request or response data", async ({
  isMobile,
}) => {
  test.skip(isMobile, "Container logs don't depend on the viewport");
  test.skip(process.env.E2E_EXTERNAL_APP !== "1", "Caddy produces the container logs");

  const secrets = {
    username: "private-user-logging-test",
    password: "private-password-logging-test",
    contact: "private-contact-logging-test",
    query: "private-query-logging-test",
    cookie: "private-cookie-logging-test",
    header: "private-header-logging-test",
    location: "private-location-logging-test",
    etag: "private-etag-logging-test",
    response: "private-response-logging-test",
  };
  const authorization = `Basic ${Buffer.from(`${secrets.username}:${secrets.password}`).toString("base64")}`;
  const body = `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${secrets.contact}\r\nEND:VCARD\r\n`;
  let status = 207;
  let rawResponse: string | undefined;
  const backend = createServer((request, response) => {
    request.resume();
    if (rawResponse) {
      request.socket.end(rawResponse);
      return;
    }
    response.writeHead(status, {
      "Set-Cookie": `session=${secrets.cookie}`,
      Location: `/${secrets.location}/`,
      ETag: `"${secrets.etag}"`,
      "X-Private": secrets.response,
    });
    response.end(body);
  });
  const reservation = createServer();
  const containerName = `natel-logging-test-${process.pid}`;
  let containerStarted = false;
  try {
    const upstreamPort = await listen(backend);
    const port = await listen(reservation);
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const origin = `http://127.0.0.1:${port}`;
    await run("docker", [
      "run",
      "-d",
      "--rm",
      "--name",
      containerName,
      "--network",
      "host",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--read-only",
      "--no-healthcheck",
      "-v",
      `${root}/Caddyfile:/etc/caddy/Caddyfile:ro`,
      "-e",
      "NATEL_ADMIN=off",
      "-e",
      `SITE_ADDRESS=${origin}`,
      "-e",
      `BAIKAL_URL=http://127.0.0.1:${upstreamPort}`,
      process.env.E2E_PROXY_IMAGE ?? "natel:ci",
    ]);
    containerStarted = true;
    await expect
      .poll(async () => {
        try {
          return (await fetch(origin)).status;
        } catch {
          return 0;
        }
      })
      .toBe(200);
    // Static successes and failures must not create access records.
    await fetch(`${origin}/assets/${secrets.contact}.js`);
    const url = `${origin}/dav/${secrets.username}/${secrets.contact}.vcf?token=${secrets.query}`;
    const headers = {
      Authorization: authorization,
      Cookie: `session=${secrets.cookie}`,
      "X-Private": secrets.header,
      Referer: `${origin}/${secrets.contact}`,
      "If-Match": `"${secrets.etag}"`,
    };
    for (const nextStatus of [207, 401, 412, 500, 307]) {
      status = nextStatus;
      const response = await fetch(url, { method: "PUT", headers, body, redirect: "manual" });
      expect(response.status).toBe(status);
      await response.text();
    }
    // HTTP parser errors can include the offending upstream bytes in their message.
    for (const malformed of [
      `HTTP/1.1 200 OK\r\nX-Private: ${secrets.response}\u0000\r\nContent-Length: 0\r\n\r\n`,
      `HTTP/1.1 ${secrets.response}\r\nContent-Length: 0\r\n\r\n`,
    ]) {
      rawResponse = malformed;
      const response = await fetch(url, { method: "REPORT", headers });
      expect(response.status).toBe(502);
      await response.text();
    }
    backend.closeAllConnections();
    await new Promise<void>((resolve) => backend.close(() => resolve()));
    const failure = await fetch(url, { method: "REPORT", headers });
    expect(failure.status).toBe(502);
    await failure.text();

    let output = "";
    let entries: LogEntry[] = [];
    await expect
      .poll(async () => {
        const logs = await run("docker", ["logs", containerName]);
        output = logs.stdout + logs.stderr;
        entries = output
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as LogEntry);
        return entries.filter((entry) => entry.logger?.startsWith("http.log.access")).length;
      })
      .toBe(8);
    const access = entries.filter((entry) => entry.logger?.startsWith("http.log.access"));
    expect(access.map((entry) => entry.status)).toEqual([207, 401, 412, 500, 307, 502, 502, 502]);
    expect(access.map((entry) => entry.request?.method)).toEqual([
      "PUT",
      "PUT",
      "PUT",
      "PUT",
      "PUT",
      "REPORT",
      "REPORT",
      "REPORT",
    ]);
    for (const entry of access) {
      expect(entry.ts).toBeGreaterThan(0);
      expect(entry.duration).toBeGreaterThanOrEqual(0);
    }
    expect(entries.some((entry) => entry.level === "info" && !entry.request)).toBe(true);
    expect(entries.some((entry) => entry.logger?.startsWith("http.log.error"))).toBe(false);
    expect(entries.some((entry) => entry.logger?.startsWith("http.handlers.reverse_proxy"))).toBe(
      false,
    );
    for (const entry of entries) {
      if (entry.request) expect(Object.keys(entry.request).sort()).toEqual(["method", "proto"]);
      expect(entry).not.toHaveProperty("resp_headers");
      expect(entry).not.toHaveProperty("user_id");
    }
    for (const secret of [...Object.values(secrets), authorization, body]) {
      expect(output).not.toContain(secret);
    }
  } finally {
    try {
      if (containerStarted) await run("docker", ["rm", "-f", containerName]);
    } finally {
      backend.closeAllConnections();
      await new Promise<void>((resolve) => backend.close(() => resolve()));
      await new Promise<void>((resolve) => reservation.close(() => resolve()));
    }
  }
});
