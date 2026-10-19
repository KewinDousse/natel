import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { type PreviewServer, preview } from "vite";
import { freePort } from "./ports";

const run = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");
const authorization = `Basic ${Buffer.from("synthetic:password").toString("base64")}`;
const containerName = `natel-redirect-test-${process.pid}`;
let backend: Server | undefined;
let frontend: PreviewServer | undefined;
let container: ChildProcess | undefined;
let origin = "";
let location = "";
let received: { url: string; authorization: string | undefined; internalHeader: boolean }[] = [];

test.skip(({ isMobile }) => isMobile, "proxy redirects don't depend on the viewport");

test.beforeAll(async () => {
  backend = createServer((request, response) => {
    // natel-session's sign-in check starts there; the redirects tested never do.
    if (request.url === "/.well-known/carddav") {
      response.statusCode = 207;
      response.end();
      return;
    }
    received.push({
      url: request.url ?? "/",
      authorization: request.headers.authorization,
      internalHeader: request.headers["natel-redirect-path"] !== undefined,
    });
    response.statusCode = received.length === 1 ? 307 : 200;
    if (received.length === 1) response.setHeader("Location", location);
    response.setHeader("Set-Cookie", "dav-session=synthetic; Path=/");
    response.setHeader("WWW-Authenticate", 'Basic realm="synthetic"');
    response.end("DAV response");
  });
  const server = backend;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP port");
  const upstream = `http://127.0.0.1:${address.port}`;

  if (process.env.E2E_EXTERNAL_APP === "1") {
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    container = spawn(
      "docker",
      [
        "run",
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
        `SITE_ADDRESS=:${port}`,
        "-e",
        `NATEL_SESSION_ADDR=127.0.0.1:${await freePort()}`,
        "-e",
        `CARDDAV_URL=${upstream}`,
        "-e",
        "NATEL_REDIRECT_TEST_SECRET=must-not-be-expanded",
        process.env.E2E_PROXY_IMAGE ?? "natel:ci",
      ],
      { stdio: "ignore" },
    );
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        ready = (await fetch(origin)).ok;
      } catch {
        ready = false;
      }
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("The redirect test Caddy did not start");
  } else {
    const previous = process.env.VITE_DAV_URL;
    process.env.VITE_DAV_URL = upstream;
    try {
      frontend = await preview({
        root,
        configFile: `${root}/vite.config.ts`,
        preview: { host: "127.0.0.1", port: 0, strictPort: true },
      });
    } finally {
      if (previous === undefined) delete process.env.VITE_DAV_URL;
      else process.env.VITE_DAV_URL = previous;
    }
    const address = frontend.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP port");
    origin = `http://127.0.0.1:${address.port}`;
  }
});

test.afterAll(async () => {
  if (container) await run("docker", ["rm", "-f", containerName]);
  if (frontend) {
    if ("closeAllConnections" in frontend.httpServer) frontend.httpServer.closeAllConnections();
    await new Promise<void>((resolve) => frontend?.httpServer.close(() => resolve()));
  }
  if (backend) {
    backend.closeAllConnections();
    await new Promise<void>((resolve) => backend?.close(() => resolve()));
  }
});

test("confines relative and absolute DAV redirects without changing their targets", async ({
  page,
  context,
}) => {
  await page.goto(origin);
  const signIn = await page.evaluate(async () => {
    const response = await fetch("/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "synthetic", password: "password" }),
    });
    return response.status;
  });
  expect(signIn).toBe(200);
  const requested: string[] = [];
  const responses: Promise<Record<string, string>>[] = [];
  page.on("response", (response) => {
    if (response.request().method() === "PROPFIND") responses.push(response.allHeaders());
  });
  page.on("request", (request) => {
    if (request.method() === "PROPFIND") requested.push(request.url());
  });
  const cases = [
    ["/books/", "/books/"],
    ["/a/..%2f../outside", "/a/..%2f../outside"],
    ["/%2f../outside", "/%2f../outside"],
    ["/a/%2e%2f/out", "/a/%2e%2f/out"],
    ["/a//b/../c", "/a//c"],
    ["/..%2fassets/foo", "/..%2fassets/foo"],
    ["///other.example/out", "/out"],
    ["?x=%23foo&y=%3F&z=%252F", "/a/b/redirect?x=%23foo&y=%3F&z=%252F"],
    ["https://upstream.example/books/", "/books/"],
    ["//upstream.example/books/", "/books/"],
    ["../books/", "/a/books/"],
    ["../../../outside", "/outside"],
    ["%2e%2e/%2E%2e/%2e./outside", "/outside"],
    ["/../outside", "/outside"],
    ["https://upstream.example", "/"],
    ["https://upstream.example?new=1", "/?new=1"],
    ["?new=1", "/a/b/redirect?new=1"],
    ["#fragment", "/a/b/redirect?old=1"],
    ["", "/a/b/redirect?old=1"],
    ["./books/", "/a/b/books/"],
    ["/%2e%2e/outside", "/outside"],
    ["https://upstream.example/a/../../out", "/out"],
    ["/a%2Fb/../out", "/out"],
    ["../.", "/a/"],
    ["/a/b/..", "/a/"],
    ["/a/b/%2e%2e?foo=bar", "/a/?foo=bar"],
    ["/name$1$$2?x=a/b&y=$foo", "/name$1$$2?x=a/b&y=$foo"],
    ["/foo%3Fbar%23baz?x=a/b&y=2", "/foo%3Fbar%23baz?x=a/b&y=2"],
    ["?sig=a=b==&x=1&x=2", "/a/b/redirect?sig=a=b==&x=1&x=2"],
    [
      "?value={env.NATEL_REDIRECT_TEST_SECRET}",
      "/a/b/redirect?value={env.NATEL_REDIRECT_TEST_SECRET}",
    ],
  ] as const;
  for (const [redirect, target] of cases) {
    location = redirect;
    received = [];
    requested.length = 0;
    responses.length = 0;
    const result = await page.evaluate(async (url) => {
      const response = await fetch(url, { method: "PROPFIND", mode: "same-origin" });
      await response.text();
      return { url: response.url, status: response.status };
    }, `${origin}/dav/a/b/redirect?old=1`);
    expect(result.status, redirect).toBe(200);
    if (redirect.includes("{env.")) {
      const actual = new URL(result.url);
      expect(actual.origin, redirect).toBe(origin);
      expect(actual.pathname, redirect).toBe("/dav/a/b/redirect");
      expect(actual.searchParams.get("value"), redirect).toBe("{env.NATEL_REDIRECT_TEST_SECRET}");
    } else {
      expect(result.url, redirect).toBe(`${origin}/dav${target}`);
    }
    for (const headers of await Promise.all(responses)) {
      expect(headers["set-cookie"], redirect).toBeUndefined();
      expect(headers["www-authenticate"], redirect).toBeUndefined();
    }
    expect(
      (await context.cookies()).map((cookie) => cookie.name),
      redirect,
    ).toEqual(["natel_session"]);
    expect(requested, redirect).toHaveLength(2);
    if (!redirect.includes("{env.")) {
      expect(
        received.map((request) => request.url),
        redirect,
      ).toEqual(["/a/b/redirect?old=1", target]);
    }
    for (const url of requested) expect(new URL(url).pathname, redirect).toMatch(/^\/dav\//);
    expect(
      received.map((request) => request.authorization),
      redirect,
    ).toEqual([authorization, authorization]);
    expect(
      received.map((request) => request.internalHeader),
      redirect,
    ).toEqual([false, false]);
  }
});
