import { defineConfig, devices } from "@playwright/test";
import { APP_URL, DAV_PORT, DAV_URL, PASSWORD, SERVER, USER } from "./tests/e2e/env";

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
      command: SERVER.command,
      url: `${DAV_URL}${SERVER.readyPath}`,
      env: { DAV_PORT: String(DAV_PORT), E2E_USER: USER, E2E_PASSWORD: PASSWORD },
      // Baïkal starts from a Docker image, which a first pull makes slow.
      timeout: 120_000,
      // Lets `docker run` stop and remove its container.
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
    // With E2E_EXTERNAL_APP=1, something else already serves the app on
    // APP_URL: CI runs the Docker image there, to exercise the Caddyfile.
    ...(process.env.E2E_EXTERNAL_APP === "1"
      ? []
      : [
          {
            // The production bundle behind Vite's preview server, whose /dav
            // proxy mirrors the Caddyfile's.
            command: `pnpm build && pnpm preview --host 127.0.0.1 --port ${new URL(APP_URL).port} --strictPort`,
            url: APP_URL,
            env: { VITE_DAV_URL: DAV_URL },
            timeout: 120_000,
          },
        ]),
  ],
});
