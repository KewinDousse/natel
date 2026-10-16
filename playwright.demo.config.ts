import { defineConfig, devices } from "@playwright/test";

// The demo build (ADR 025): no CardDAV server, served under /natel/ as on
// GitHub Pages. `pnpm e2e` keeps its own config and servers.
const PORT = 4399;

export default defineConfig({
  testDir: "tests/e2e-demo",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}/natel/`,
    locale: "en-US",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm build --outDir dist-demo && pnpm preview --outDir dist-demo --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/natel/`,
    env: { VITE_DEMO: "1", VITE_BASE: "/natel/", DEMO_URL: `http://127.0.0.1:${PORT}/natel/` },
    timeout: 120_000,
  },
});
