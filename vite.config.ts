import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
    proxy: process.env.VITE_DAV_URL
      ? {
          "/dav": {
            target: process.env.VITE_DAV_URL,
            changeOrigin: true,
          },
        }
      : undefined,
  },
});
