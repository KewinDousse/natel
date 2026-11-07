import { defineConfig, devices } from "@playwright/test";
import { APP_URL, DAV_PORT, DAV_URL, PASSWORD, USER } from "./tests/performance/env";

export default defineConfig({
  testDir: "tests/performance",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 1_800_000,
  outputDir: "test-results/performance",
  reporter: [["list"], ["html", { outputFolder: "playwright-report/performance", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: APP_URL,
    locale: "en-US",
    // Recording adds work to every render and request being measured.
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: [
    {
      command: "bash tests/performance/radicale.sh",
      url: `${DAV_URL}/.well-known/carddav`,
      env: { DAV_PORT: String(DAV_PORT), E2E_USER: USER, E2E_PASSWORD: PASSWORD },
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
    {
      command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${new URL(APP_URL).port} --strictPort`,
      url: APP_URL,
      env: { VITE_DEMO: "0", VITE_DAV_URL: DAV_URL },
      timeout: 120_000,
    },
  ],
});
