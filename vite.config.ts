import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app's Content-Security-Policy, read from the Caddyfile so the e2e suite
// runs the production bundle under the policy users get.
const caddyfile = readFileSync(`${import.meta.dirname}/Caddyfile`, "utf8");
const csp = /\(security_headers\)[\s\S]*?Content-Security-Policy "([^"]+)"/.exec(caddyfile)?.[1];
if (!csp) throw new Error("No Content-Security-Policy in the Caddyfile's security_headers");

/** What the /dav proxy relays: the methods the app sends, as in the Caddyfile. */
const DAV_METHODS = ["PROPFIND", "REPORT", "PUT", "DELETE"];

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": `${import.meta.dirname}/src`,
    },
  },
  server: {
    // VITE_DAV_URL must be origin-only (scheme://host[:port], no path).
    // When set, requests to /dav/* are proxied to the CardDAV server.
    // The rewrite strips /dav prefix to match prod Caddy handle_path /dav/*
    // semantics: /dav/dav.php/... reaches {$BAIKAL_URL}/dav.php/...
    proxy: process.env.VITE_DAV_URL
      ? {
          "/dav": {
            target: process.env.VITE_DAV_URL,
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/dav/, ""),
            // Same as the Caddyfile: only the methods the app sends.
            bypass: (req, res) => {
              if (res && !DAV_METHODS.includes(req.method ?? "")) {
                res.writeHead(405, { Allow: DAV_METHODS.join(", ") }).end();
                return req.url;
              }
            },
            // Same as the Caddyfile's header_down: map redirects under /dav
            // and drop the challenge that opens the browser's login prompt.
            configure: (proxy) => {
              proxy.on("proxyRes", (res) => {
                const location = res.headers.location;
                if (location)
                  res.headers.location = location.replace(/^(https?:\/\/[^/]+)?\//, "/dav/");
                delete res.headers["www-authenticate"];
              });
            },
          },
        }
      : undefined,
  },
  preview: {
    headers: { "Content-Security-Policy": csp },
  },
});
