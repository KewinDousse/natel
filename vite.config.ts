import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { devSession } from "./session/dev-session.ts";
import { DEMO_BOOKS } from "./src/dav/demo-seed.ts";
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

// The demo build (ADR 025): an in-memory CardDAV stand-in.
const demo = process.env.VITE_DEMO === "1";
// The demo's public address: link previews only fetch an image from an
// absolute URL, so without it the demo build carries no preview image.
const demoUrl = process.env.DEMO_URL;
// Resolved against it, a URL without the trailing slash loses its last segment.
if (demoUrl && !demoUrl.endsWith("/")) throw new Error("DEMO_URL must end with /");

// The source revision the settings page shows. The image's build has no .git
// (.dockerignore), so it gets one only from NATEL_REVISION, as CI passes it.
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

const OG_IMAGE = "og-image.png";

// Group cards have no page of their own. The seed's form of what `isGroupCard`
// reads, from the text: parsing would bring ical.js into the config.
// tests/demo-pages.test.ts checks that both agree.
const GROUP_KIND = /^(?:X-ADDRESSBOOKSERVER-)?KIND:group\r?$/im;

/**
 * The demo's pages, one per route and seed book and contact: GitHub Pages
 * serves `/a/b` from `a/b.html` with a 200, where 404.html answers 404.
 */
export function demoPages(): string[] {
  return [
    "contacts",
    "login",
    "logout",
    "settings",
    "settings/help",
    ...DEMO_BOOKS.flatMap(({ slug, cards }) => [
      `contacts/${slug}`,
      `contacts/${slug}/new`,
      ...Object.entries(cards)
        .filter(([, card]) => !GROUP_KIND.test(card))
        .map(([id]) => `contacts/${slug}/${id}`),
    ]),
  ];
}

/**
 * What a static host can't send as headers: the CSP as a meta tag (without
 * frame-ancestors, which a meta tag can't set), a page for each link a
 * visitor can share (`demoPages`), and a 404.html that loads the app on any
 * other path. With DEMO_URL, also each page's link preview: its URL and image.
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
      const preview = demoUrl
        ? [
            { property: "og:url", content: demoUrl },
            { property: "og:image", content: new URL(OG_IMAGE, demoUrl).href },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
            { name: "twitter:card", content: "summary_large_image" },
          ]
        : [];
      return [
        {
          tag: "meta",
          attrs: { name: "robots", content: "noindex, follow" },
          injectTo: "head",
        },
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: policy },
          injectTo: "head-prepend",
        },
        ...preview.map((attrs) => ({ tag: "meta", attrs, injectTo: "head" as const })),
      ];
    },
    generateBundle() {
      if (demoUrl) {
        this.emitFile({
          type: "asset",
          fileName: OG_IMAGE,
          source: readFileSync(`${import.meta.dirname}/docs/brand/social/og-image-en.png`),
        });
      }
    },
    writeBundle() {
      if (!existsSync(`${outDir}/index.html`)) return;
      copyFileSync(`${outDir}/index.html`, `${outDir}/404.html`);
      const html = readFileSync(`${outDir}/index.html`, "utf8");
      for (const page of demoPages()) {
        const file = `${outDir}/${page}.html`;
        mkdirSync(dirname(file), { recursive: true });
        // A preview of a shared link names that link, not the demo's root.
        const own = demoUrl && new URL(page, demoUrl).href;
        writeFileSync(
          file,
          own ? html.replace(/(property="og:url" content=")[^"]*/, (_, tag) => tag + own) : html,
        );
      }
    },
  };
}

/** What the /dav proxy relays: the methods the app sends, as in the Caddyfile. */
const DAV_METHODS = ["PROPFIND", "REPORT", "PUT", "DELETE"];
const davOrigin = process.env.VITE_DAV_URL;

export default defineConfig({
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
    // /dav/dav.php/... reaches {$CARDDAV_URL}/dav.php/...
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
