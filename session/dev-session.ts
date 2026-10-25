/**
 * natel-session's contract on Vite's dev and preview servers (ADR 032): the
 * image runs the Go binary in session/; this mirrors it so dev and
 * production keep one /dav contract. /session opens, reads and ends a
 * session held in memory, and a /dav request gets the session's
 * Authorization before the proxy relays it.
 */
import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

const COOKIE = "natel_session";
const IDLE_MS = 12 * 60 * 60 * 1000;
const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BODY = 4 * 1024;
// The context roots the app's discovery tries, in its order (src/dav/internal.ts).
const CONTEXT_ROOTS = ["/.well-known/carddav", "/", "/dav.php/"];
const MAX_REDIRECTS = 5;
const PRINCIPAL_QUERY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;

type Session = { username: string; authorization: string; created: number; lastSeen: number };

// No session cap or sweep, unlike natel-session: a dev server holds a few.

export function devSession(davOrigin: string | undefined, davMethods: string[]): Plugin {
  const sessions = new Map<string, Session>();
  const key = (token: string) => createHash("sha256").update(token).digest("hex");

  function lookup(req: IncomingMessage): Session | undefined {
    const token = readCookie(req);
    if (!token) return undefined;
    const session = sessions.get(key(token));
    if (!session) return undefined;
    const now = Date.now();
    if (now - session.lastSeen >= IDLE_MS || now - session.created >= LIFETIME_MS) {
      sessions.delete(key(token));
      return undefined;
    }
    session.lastSeen = now;
    return session;
  }

  async function signIn(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!sameOrigin(req)) return end(res, 403);
    const media = req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
    if (media !== "application/json") return end(res, 415);
    let body: unknown;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      return end(res, err instanceof RangeError ? 413 : 400);
    }
    const { username, password } = (body ?? {}) as Record<string, unknown>;
    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username ||
      !password ||
      username.includes(":")
    ) {
      return end(res, 400);
    }
    if (!davOrigin) return end(res, 503);
    const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    const verdict = await verify(davOrigin, authorization);
    if (verdict !== "ok") return end(res, verdict === "rejected" ? 401 : 502);
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    sessions.set(key(token), { username, authorization, created: now, lastSeen: now });
    res.setHeader("Set-Cookie", cookie(token, LIFETIME_MS / 1000));
    json(res, { username });
  }

  function session(req: IncomingMessage, res: ServerResponse): void {
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "POST") {
      signIn(req, res).catch(() => end(res, 500));
    } else if (req.method === "GET") {
      const current = lookup(req);
      if (current) json(res, { username: current.username });
      else end(res, 401);
    } else if (req.method === "DELETE") {
      if (!sameOrigin(req)) {
        end(res, 403);
        return;
      }
      const token = readCookie(req);
      if (token) sessions.delete(key(token));
      res.setHeader("Set-Cookie", cookie("", 0));
      end(res, 204);
    } else {
      end(res, 405);
    }
  }

  function handle(req: IncomingMessage, res: ServerResponse, next: () => void): void {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/updates") {
      res.setHeader("Cache-Control", "no-store");
      if (req.method !== "GET") end(res, 405);
      else if (!lookup(req)) end(res, 401);
      else json(res, { enabled: false });
      return;
    }
    if (path === "/session") {
      session(req, res);
      return;
    }
    // The proxy's own 405 comes first, as in the Caddyfile. Its key, /dav,
    // matches any path that starts so.
    if (path?.startsWith("/dav") && davMethods.includes(req.method ?? "")) {
      const current = lookup(req);
      if (!current) {
        end(res, 401);
        return;
      }
      req.headers.authorization = current.authorization;
    }
    next();
  }

  return {
    name: "natel-session-mirror",
    configureServer(server) {
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}

/** A 207 on a context root accepts the credentials; a 401 or 403 rejects them. */
async function verify(
  origin: string,
  authorization: string,
): Promise<"ok" | "rejected" | "unreachable" | "unexpected"> {
  let unreachable = false;
  for (const root of CONTEXT_ROOTS) {
    let status: number;
    try {
      status = await propfind(origin, root, authorization);
    } catch {
      unreachable = true;
      continue;
    }
    if (status === 207) return "ok";
    if (status === 401 || status === 403) return "rejected";
  }
  return unreachable ? "unreachable" : "unexpected";
}

/** Redirects stay on the configured server, as the /dav proxy maps them. */
async function propfind(origin: string, path: string, authorization: string): Promise<number> {
  let target = new URL(path, origin);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // natel-session's own budget for each request.
    const response = await fetch(target, {
      signal: AbortSignal.timeout(20_000),
      method: "PROPFIND",
      headers: {
        Authorization: authorization,
        Depth: "0",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: PRINCIPAL_QUERY,
      redirect: "manual",
    });
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return response.status;
    const next = new URL(location, target);
    target = new URL(`${next.pathname}${next.search}`, origin);
  }
  return 508;
}

/** As natel-session decides it: Sec-Fetch-Site first, then the Origin's host. */
function sameOrigin(req: IncomingMessage): boolean {
  const site = req.headers["sec-fetch-site"];
  if (site) return site === "same-origin";
  try {
    const origin = new URL(req.headers.origin ?? "");
    return /^https?:$/.test(origin.protocol) && origin.host === req.headers.host;
  } catch {
    return false;
  }
}

/** Two cookies of the same name open nothing, as in natel-session. */
function readCookie(req: IncomingMessage): string | undefined {
  const values: string[] = [];
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE) values.push(value.join("="));
  }
  return values.length === 1 ? values[0] : undefined;
}

/** Vite serves over plain HTTP: the cookie can't be Secure there. */
function cookie(value: string, maxAge: number): string {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new RangeError("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

function end(res: ServerResponse, status: number): void {
  res.writeHead(status).end();
}
