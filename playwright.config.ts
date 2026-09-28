import { defineConfig, devices } from "@playwright/test";
import { APP_URL, PASSWORD, RADICALE_PORT, RADICALE_URL, USER } from "./tests/e2e/env";

export default defineConfig({
  testDir: "tests/e2e",
  // Tests share one address book on one server; running them in parallel
  // would let one test's writes show up in another's list.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: APP_URL,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // Sandboxes with a preinstalled Chromium point at it instead of
      // downloading the build matching this Playwright version.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "tests/e2e/radicale.sh",
      url: `${RADICALE_URL}/.well-known/carddav`,
      env: { RADICALE_PORT: String(RADICALE_PORT), E2E_USER: USER, E2E_PASSWORD: PASSWORD },
    },
    {
      // The production bundle behind Vite's preview server, whose /dav proxy
      // mirrors the Caddyfile's.
      command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${new URL(APP_URL).port} --strictPort`,
      url: APP_URL,
      env: { VITE_DAV_URL: RADICALE_URL },
      timeout: 120_000,
    },
  ],
});
