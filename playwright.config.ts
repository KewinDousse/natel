import { existsSync } from "node:fs";
import { defineConfig, devices, firefox, webkit } from "@playwright/test";
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
    // Sign-in alone, in Firefox, whose session requests differ from
    // Chromium's under the page's no-referrer policy (ADR 032). It runs
    // against session/dev-session.ts, which reads Sec-Fetch-Site first as
    // natel-session does: the Origin fallback and the app's own referrer
    // policy are covered by unit tests. Skipped where Playwright's own
    // Firefox isn't installed, as in Claude Code's web sandbox or CI's
    // image job.
    ...(existsSync(firefox.executablePath())
      ? [
          {
            name: "firefox",
            use: {
              ...devices["Desktop Firefox"],
              // Without the Chromium executable set above for every project.
              // Under Playwright, the Cross-Origin-Opener-Policy the app sends
              // sometimes loses a navigation's events in Firefox, so a goto
              // never returns; the pref turns COOP off in this Firefox only.
              launchOptions: {
                firefoxUserPrefs: { "browser.tabs.remote.useCrossOriginOpenerPolicy": false },
              },
            },
            testMatch: "login.spec.ts",
          },
        ]
      : []),
    // The main flows in WebKit, Safari's engine: sign-in, the list, editing
    // and photos. Skipped where Playwright's own WebKit isn't installed, as
    // for Firefox.
    ...(existsSync(webkit.executablePath())
      ? [
          {
            name: "webkit",
            // Without the Chromium executable set above for every project.
            use: { ...devices["Desktop Safari"], launchOptions: {} },
            // On the CI runner, a WebKit test now and then runs out of time:
            // the browser sits idle for 25 s while loading a page, or
            // Xandikos takes over 5 s on the list's REPORT late in the
            // suite. Neither has shown up on another machine.
            retries: process.env.CI ? 1 : 0,
            testMatch: [
              "login.spec.ts",
              "list.spec.ts",
              "contacts.spec.ts",
              "groups-edit.spec.ts",
              "photos.spec.ts",
              "photo-edit.spec.ts",
            ],
          },
        ]
      : []),
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
