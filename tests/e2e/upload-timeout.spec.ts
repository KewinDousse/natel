import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { Agent, createServer, request as httpRequest, type Server } from "node:http";
import { type ClientHttp2Session, connect as http2Connect } from "node:http2";
import { createConnection, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { freePort } from "./ports";
import { openSession } from "./session";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
// The session cookie that gets each /dav request through (ADR 032), set once signed in.
let cookie = "";

type CaddyServer = {
  protocols?: string[];
  read_timeout?: number;
  read_idle_timeout?: number;
  read_header_timeout?: number;
};

type CaddyConfig = {
  apps: {
    http: { servers: Record<string, CaddyServer> };
    tls?: { automation: { policies: { subjects: string[]; issuers: { module: string }[] }[] } };
    pki?: { certificate_authorities: { local: { install_trust: boolean } } };
  };
};

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP port");
  return address.port;
}

function interruptedUpload(
  origin: string,
  path: string,
  { trickle = false, close = false } = {},
): Promise<{ elapsed: number; statusLine: string }> {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const started = performance.now();
    let progress: NodeJS.Timeout | undefined;
    let reply = "";
    const socket = createConnection({ host: url.hostname, port: Number(url.port) }, () => {
      socket.write(
        `PUT /dav/${path} HTTP/1.1\r\nHost: ${url.host}\r\nCookie: ${cookie}\r\n${close ? "Connection: close\r\n" : ""}If-None-Match: *\r\nContent-Length: 1000\r\n\r\nBEGIN:VCARD`,
      );
      if (trickle) progress = setInterval(() => socket.write("x"), 200);
    });
    const deadline = setTimeout(() => {
      reject(new Error("The incomplete upload survived its read budget"));
      socket.destroy();
    }, 6_000);
    socket.on("data", (chunk: Buffer) => {
      reply += chunk.toString("latin1");
    });
    socket.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "ECONNRESET") {
        reject(error);
        socket.destroy();
      }
    });
    socket.on("close", () => {
      clearTimeout(deadline);
      clearInterval(progress);
      resolve({ elapsed: performance.now() - started, statusLine: reply.split("\r\n")[0] ?? "" });
    });
  });
}

function completeUpload(origin: string, agent: Agent): Promise<Socket | undefined> {
  return new Promise((resolve, reject) => {
    let socket: Socket | undefined;
    const request = httpRequest(
      `${origin}/dav/complete.vcf`,
      {
        method: "PUT",
        agent,
        headers: { Cookie: cookie, "If-None-Match": "*" },
      },
      (response) => {
        response.resume();
        response.on("error", reject);
        response.on("end", () => {
          if (response.statusCode !== 200) reject(new Error("The complete upload failed"));
          else resolve(socket);
        });
      },
    );
    request.on("socket", (connection) => {
      socket = connection;
    });
    request.on("error", reject);
    request.end("BEGIN:VCARD\r\nEND:VCARD\r\n");
  });
}

function http2Upload(
  session: ClientHttp2Session,
  path: string,
  trickle?: boolean,
): Promise<{ elapsed: number; status: number | undefined }> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const stream = session.request({
      ":method": "PUT",
      ":path": `/dav/${path}`,
      cookie,
      "if-none-match": "*",
    });
    let status: number | undefined;
    let progress: NodeJS.Timeout | undefined;
    stream.on("response", (headers) => {
      status = headers[":status"];
    });
    stream.on("error", (error: NodeJS.ErrnoException) => {
      if (trickle === undefined || error.code !== "ERR_HTTP2_STREAM_ERROR") reject(error);
    });
    const deadline = setTimeout(() => {
      reject(new Error("The HTTP/2 upload survived its read budget"));
      stream.close();
    }, 6_000);
    stream.on("close", () => {
      clearTimeout(deadline);
      clearInterval(progress);
      if (trickle === undefined && status !== 200) reject(new Error("The HTTP/2 upload failed"));
      else resolve({ elapsed: performance.now() - started, status });
    });
    stream.resume();
    if (trickle === undefined) stream.end("BEGIN:VCARD\r\nEND:VCARD\r\n");
    else {
      stream.write("BEGIN:VCARD");
      if (trickle) progress = setInterval(() => stream.write("x"), 200);
    }
  });
}

test("bounds stalled and trickling uploads and releases their upstream requests", async ({
  isMobile,
}) => {
  test.skip(isMobile, "HTTP read budgets don't depend on the viewport");
  test.skip(process.env.E2E_EXTERNAL_APP !== "1", "Caddy enforces the HTTP read budgets");
  const aborted: string[] = [];
  const givenUp: string[] = [];
  const backend = createServer((request, response) => {
    // How servers give up on a stalled upload: some answer 408, others close
    // the connection without an answer. Both only after their own body
    // timeout: these reproduce the outcome, not the timing.
    if (request.url === "/rejected.vcf" || request.url === "/rejected-kept-alive.vcf") {
      givenUp.push(request.url);
      response.writeHead(408, { Connection: "close" }).end();
      return;
    }
    if (request.url === "/abandoned.vcf") {
      givenUp.push(request.url);
      request.socket.destroy();
      return;
    }
    request.on("aborted", () => aborted.push(request.url ?? ""));
    request.on("error", () => {});
    request.on("end", () => {
      // natel-session's sign-in check is a PROPFIND: a 207 accepts it.
      if (request.method === "PROPFIND") response.statusCode = 207;
      response.end("ok");
    });
    request.resume();
  });
  const portReservation = createServer();
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  const containerName = `natel-upload-budget-${process.pid}`;
  let directory: string | undefined;
  let containerStarted = false;
  let http2: ClientHttp2Session | undefined;
  try {
    const upstreamPort = await listen(backend);
    const port = await listen(portReservation);
    await new Promise<void>((resolve) => portReservation.close(() => resolve()));
    const tlsPort = await listen(portReservation);
    await new Promise<void>((resolve) => portReservation.close(() => resolve()));
    // The CI's app container holds natel-session's default port on the host network.
    const sessionAddress = `127.0.0.1:${await freePort()}`;
    const sessionSecret = randomBytes(32).toString("base64url");
    const origin = `http://127.0.0.1:${port}`;
    const tlsOrigin = `https://localhost:${tlsPort}`;
    const image = process.env.E2E_PROXY_IMAGE ?? "natel:ci";
    const { stdout } = await run("docker", [
      "run",
      "--rm",
      "--entrypoint",
      "caddy",
      "-v",
      `${root}/Caddyfile:/etc/caddy/Caddyfile:ro`,
      "-e",
      `NATEL_HEALTH_PORT=${await freePort()}`,
      "-e",
      `SITE_ADDRESS=${origin}, ${tlsOrigin}`,
      "-e",
      `CARDDAV_URL=http://127.0.0.1:${upstreamPort}`,
      "-e",
      `NATEL_SESSION_ADDR=${sessionAddress}`,
      // The adapted config holds it: natel-session must use the same one.
      "-e",
      `NATEL_SESSION_SECRET=${sessionSecret}`,
      image,
      "adapt",
      "--config",
      "/etc/caddy/Caddyfile",
    ]);
    const configuration = JSON.parse(stdout) as CaddyConfig;
    // Use a local CA for the HTTPS test server, without external ACME requests.
    configuration.apps.tls = {
      automation: { policies: [{ subjects: ["localhost"], issuers: [{ module: "internal" }] }] },
    };
    configuration.apps.pki = { certificate_authorities: { local: { install_trust: false } } };
    const servers = Object.values(configuration.apps.http.servers);
    expect(servers).not.toHaveLength(0);
    const productionBudgets = servers.map((server) => ({ ...server }));
    // Exercise the production configuration with a short clock, not a ten-minute CI wait.
    for (const server of servers) {
      if (server.read_timeout !== undefined) server.read_timeout = 2_000_000_000;
      if ((server.read_idle_timeout ?? 0) > 0) server.read_idle_timeout = 2_000_000_000;
    }
    directory = await mkdtemp(join(tmpdir(), "natel-upload-budget-"));
    const configPath = join(directory, "caddy.json");
    await writeFile(configPath, JSON.stringify(configuration));
    await chmod(configPath, 0o644);
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
      "--tmpfs",
      "/data:uid=10001,gid=10001,mode=0700",
      "--no-healthcheck",
      "-v",
      `${configPath}:/etc/caddy/caddy.json:ro`,
      "-e",
      `CARDDAV_URL=http://127.0.0.1:${upstreamPort}`,
      "-e",
      `NATEL_SESSION_ADDR=${sessionAddress}`,
      "-e",
      `NATEL_SESSION_SECRET=${sessionSecret}`,
      image,
      "caddy",
      "run",
      "--config",
      "/etc/caddy/caddy.json",
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
    cookie = await openSession(origin, "synthetic", "password");
    const [rejected, keptAlive, stalled, trickling, abandoned] = await Promise.all([
      interruptedUpload(origin, "rejected.vcf", { close: true }),
      interruptedUpload(origin, "rejected-kept-alive.vcf"),
      interruptedUpload(origin, "stalled.vcf"),
      interruptedUpload(origin, "trickling.vcf", { trickle: true }),
      interruptedUpload(origin, "abandoned.vcf", { close: true }),
    ]);
    expect(givenUp.sort()).toEqual(["/abandoned.vcf", "/rejected-kept-alive.vcf", "/rejected.vcf"]);
    // The upstream's 408 ends the upload at once, whether the client closes
    // the connection or keeps it alive, as a browser does.
    for (const { statusLine, elapsed } of [rejected, keptAlive]) {
      expect(statusLine).toBe("HTTP/1.1 408 Request Timeout");
      expect(elapsed).toBeLessThan(1_500);
    }
    for (const { elapsed } of [stalled, trickling]) {
      expect(elapsed).toBeGreaterThanOrEqual(1_500);
      expect(elapsed).toBeLessThan(5_000);
    }
    // Caddy's proxy waits for the rest of the body before giving up, so this
    // client gets a 502 or 504 at the budget; failing sooner would pass too.
    expect(abandoned.statusLine).toMatch(/^HTTP\/1\.1 50[24] /);
    expect(abandoned.elapsed).toBeLessThan(5_000);
    await expect.poll(() => [...aborted].sort()).toEqual(["/stalled.vcf", "/trickling.vcf"]);
    for (const server of productionBudgets) {
      expect(server.protocols).toEqual(["h1", "h2"]);
      expect(server.read_timeout).toBe(600_000_000_000);
      expect(server.read_idle_timeout).toBe(-1_000_000_000);
      expect(server.read_header_timeout).toBe(60_000_000_000);
    }
    const first = await completeUpload(origin, agent);
    const second = await completeUpload(origin, agent);
    expect(first).toBeDefined();
    expect(second).toBe(first);
    http2 = http2Connect(tlsOrigin, { rejectUnauthorized: false });
    await new Promise<void>((resolve, reject) => {
      http2?.once("error", reject);
      http2?.once("connect", resolve);
    });
    expect(http2.alpnProtocol).toBe("h2");
    // A 408 already arrives at once on HTTP/2, and the uploads below check
    // that it leaves the shared connection open.
    const rejectedHttp2 = await http2Upload(http2, "rejected.vcf", false);
    expect(rejectedHttp2.status).toBe(408);
    expect(rejectedHttp2.elapsed).toBeLessThan(1_500);
    const http2Elapsed = await Promise.all([
      http2Upload(http2, "http2-stalled.vcf", false),
      http2Upload(http2, "http2-trickling.vcf", true),
    ]);
    for (const { elapsed } of http2Elapsed) {
      expect(elapsed).toBeGreaterThanOrEqual(1_500);
      expect(elapsed).toBeLessThan(5_000);
    }
    await expect
      .poll(() => [...aborted].sort())
      .toEqual(["/http2-stalled.vcf", "/http2-trickling.vcf", "/stalled.vcf", "/trickling.vcf"]);
    await http2Upload(http2, "http2-complete.vcf");
    expect(http2.destroyed).toBe(false);
  } finally {
    http2?.destroy();
    agent.destroy();
    try {
      if (containerStarted) await run("docker", ["rm", "-f", containerName]);
    } finally {
      backend.closeAllConnections();
      await new Promise<void>((resolve) => backend.close(() => resolve()));
      await new Promise<void>((resolve) => portReservation.close(() => resolve()));
      if (directory) await rm(directory, { recursive: true });
    }
  }
});
