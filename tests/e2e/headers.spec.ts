import { expect, test } from "@playwright/test";
import { PASSWORD, USER } from "./env";

// These headers come from the image's Caddyfile, which only the CI image job
// puts in front of the suite.
test.skip(process.env.E2E_EXTERNAL_APP !== "1", "served by the image's Caddy only");
test.skip(({ isMobile }) => isMobile, "headers don't depend on the viewport");

test("sends the security and cache headers", async ({ request }) => {
  const page = await request.get("/");
  const headers = page.headers();
  expect(headers["content-security-policy"]).toBe(
    "default-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  expect(headers["cache-control"]).toBe("no-cache");
  expect(headers["x-xss-protection"]).toBeUndefined();

  const script = (await page.text()).match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  expect(script).toBeDefined();
  const asset = await request.get(script ?? "");
  expect(asset.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");

  // Not index.html served in its place.
  expect((await request.get("/assets/missing.js")).status()).toBe(404);

  const dav = await request.get("/dav/");
  expect(dav.headers()["content-security-policy"]).toBe(
    "sandbox; default-src 'none'; frame-ancestors 'none'",
  );
});

test("breaks no rule of its own content security policy", async ({ page }) => {
  const violations: string[] = [];
  await page.exposeFunction("reportViolation", (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { reportViolation: (v: string) => void }).reportViolation(
        `${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("searchbox")).toBeVisible();
  // Violations are reported asynchronously.
  await page.waitForLoadState("networkidle");
  expect(violations).toEqual([]);
});
