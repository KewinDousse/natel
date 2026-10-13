import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { devSession } from "./dev-session.ts";
import { proxyLocation } from "./src/dav/proxy-location.ts";

// The app's security headers, read from the Caddyfile so the e2e suite runs
// the production bundle under the headers users get.
const caddyfile = readFileSync(`${import.meta.dirname}/Caddyfile`, "utf8");
const snippet = /\(security_headers\)\s*\{\s*header\s*\{([^}]*)\}/.exec(caddyfile)?.[1] ?? "";
const securityHeaders: Record<string, string> = {};
for (const [, name, value] of snippet.matchAll(/^\s*([\w-]+) "([^"]+)"$/gm)) {
  if (name && value) securityHeaders[name] = value;
}
const csp = securityHeaders["Content-Security-Policy"];
if (!csp) throw new Error("No Content-Security-Policy in the Caddyfile's security_headers");

// The demo build (ADR 025): an in-memory CardDAV stand-in, servable under a
// subpath (VITE_BASE, such as /natel/ for GitHub Pages).
const demo = process.env.VITE_DEMO === "1";
const base = process.env.VITE_BASE ?? "/";

export function buildRevision(): string {
  if (process.env.NATEL_REVISION) return process.env.NATEL_REVISION;
  try {
    return execFileSync("git", ["describe", "--always", "--dirty"], {
      cwd: import.meta.dirname,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

/**
 * What a static host can't send as headers: the CSP as a meta tag (without
 * frame-ancestors, which a meta tag can't set), and a 404.html that loads
 * the app on a deep link.
 */
function demoStaticHost(): Plugin {
  let outDir = "dist";
  return {
    name: "natel-demo-static-host",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml() {
      const policy = (csp ?? "").replace(/;?\s*frame-ancestors [^;]*/, "");
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: policy },
          injectTo: "head-prepend",
        },
      ];
    },
    writeBundle() {
      if (existsSync(`${outDir}/index.html`)) {
        copyFileSync(`${outDir}/index.html`, `${outDir}/404.html`);
      }
    },
  };
}

/** What the /dav proxy relays: the methods the app sends, as in the Caddyfile. */
const DAV_METHODS = ["PROPFIND", "REPORT", "PUT", "DELETE"];
const davOrigin = process.env.VITE_DAV_URL;

export default defineConfig({
  base,
  // The demo reminders follow the same switch as the alias, never a .env file.
  define: {
    "import.meta.env.VITE_DEMO": JSON.stringify(demo ? "1" : ""),
    "import.meta.env.VITE_BUILD_REVISION": JSON.stringify(buildRevision()),
  },
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    demo ? demoStaticHost() : devSession(davOrigin, DAV_METHODS),
  ],
  resolve: {
    alias: [
      // Exactly `@/dav`, before `@`: `@/dav/types` stays the real types.
      ...(demo
        ? [{ find: /^@\/dav$/, replacement: `${import.meta.dirname}/src/dav/demo.ts` }]
        : []),
      { find: "@", replacement: `${import.meta.dirname}/src` },
    ],
  },
  server: {
    // VITE_DAV_URL must be origin-only (scheme://host[:port], no path).
    // When set, requests to /dav/* are proxied to the CardDAV server.
    // The same escaped-path prefix removal as the production Caddyfile:
    // /dav/dav.php/... reaches {$BAIKAL_URL}/dav.php/...
    proxy: davOrigin
      ? {
          "/dav": {
            target: davOrigin,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/dav/, ""),
            // Same as the Caddyfile: only the methods the app sends.
            bypass: (req, res) => {
              if (res && !DAV_METHODS.includes(req.method ?? "")) {
                res.writeHead(405, { Allow: DAV_METHODS.join(", ") }).end();
                return req.url;
              }
            },
            // Same as the Caddyfile's header_up and header_down: map redirects
            // under /dav, drop the challenge that opens the browser's login
            // prompt, let no cookie through either way, and drop the server's
            // software and version.
            configure: (proxy) => {
              proxy.on("proxyReq", (proxyReq) => {
                proxyReq.removeHeader("cookie");
              });
              proxy.on("proxyRes", (res, req) => {
                const location = res.headers.location;
                if (location !== undefined) {
                  const mapped = proxyLocation(location, req.url ?? "/", davOrigin);
                  if (mapped === null) {
                    res.statusCode = 502;
                    delete res.headers.location;
                  } else {
                    res.headers.location = mapped;
                  }
                }
                delete res.headers["www-authenticate"];
                delete res.headers["set-cookie"];
                delete res.headers.server;
                delete res.headers["x-powered-by"];
              });
            },
          },
        }
      : undefined,
  },
  preview: {
    headers: securityHeaders,
  },
});
