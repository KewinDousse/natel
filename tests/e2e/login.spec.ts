import { expect, type Page, test } from "@playwright/test";
import { APP_URL, PASSWORD, USER } from "./env";

test.skip(({ isMobile }) => isMobile, "the markup doesn't depend on the viewport");

// What password managers key on to recognise a sign-in form and offer to fill
// or save it.
test("marks the sign-in form for password managers", async ({ page }) => {
  await page.goto("/");
  const form = page.locator("form").filter({ has: page.locator('input[type="password"]') });
  await expect(form).toHaveAttribute("method", "post");
  await expect(page.getByLabel("Username")).toHaveAttribute("name", "username");
  await expect(page.getByLabel("Username")).toHaveAttribute("autocomplete", "username");
  const password = page.getByLabel("Password", { exact: true });
  await expect(password).toHaveAttribute("name", "password");
  await expect(password).toHaveAttribute("autocomplete", "current-password");
});

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("searchbox")).toBeVisible();
}

// Natel's session cookie is the only one: Baïkal opens a PHP session on
// every request, and its cookie would stay in the browser after the logout.
test("keeps only its own session cookie, out of page scripts' reach", async ({ page }) => {
  await signIn(page);
  const cookies = await page.context().cookies();
  expect(cookies.map((cookie) => cookie.name)).toEqual(["natel_session"]);
  expect(cookies[0]).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" });
  // A cookie that lasts beyond the browser's session, so reopening it keeps the session.
  expect(cookies[0]?.expires).toBeGreaterThan(Date.now() / 1000 + 6 * 24 * 60 * 60);
  expect(await page.evaluate(() => document.cookie)).toBe("");
});

test("stays signed in across a reload", async ({ page }) => {
  await signIn(page);
  await page.reload();
  await expect(page.getByRole("searchbox")).toBeVisible();
  await expect(page).toHaveURL(/\/contacts/);
});

test("ends the session on sign-out", async ({ page }) => {
  await signIn(page);
  const token = (await page.context().cookies())[0]?.value;
  await page.goto("/logout");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  // The old cookie opens nothing on the server either.
  const response = await page.request.fetch("/dav/", {
    method: "PROPFIND",
    headers: { Depth: "0", Cookie: `natel_session=${token}` },
  });
  expect(response.status()).toBe(401);
});

// A reload would sign the user back in: a sign-out the server didn't see
// must not look done.
test("stays signed in when the sign-out doesn't reach the server", async ({ page }) => {
  await signIn(page);
  await page.route("**/session", (route) =>
    route.request().method() === "DELETE" ? route.abort() : route.continue(),
  );
  await page.getByRole("link", { name: "Settings" }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByText("Couldn’t sign out: check the connection and try again."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/contacts\/settings$/);
  await page.unroute("**/session");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

// The session can end while the app is open: elsewhere, or as the container
// restarts. The next write says so, and a reload asks to sign in.
test("asks to sign in again once the session ended on the server", async ({ page }) => {
  await signIn(page);
  const ended = await page.request.delete("/session", { headers: { Origin: APP_URL } });
  expect(ended.status()).toBe(204);
  await page.getByRole("link", { name: "New contact" }).filter({ visible: true }).click();
  await page.getByLabel("Last name", { exact: true }).fill("Hopper");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Session expired: sign in again.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await signIn(page);
});

// The thumb-index tabs are decoration: screen readers skip them, and on the
// smallest desktop they end above the tagline, so above the wordmark too.
test("ends the index tabs above the tagline", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 640 });
  await page.goto("/");
  const tabs = page.locator("aside ol");
  await expect(tabs.locator("li")).toHaveText([
    "A–B",
    "C–D",
    "E–G",
    "H–K",
    "L–M",
    "N–P",
    "Q–S",
    "T–V",
    "W–Z",
  ]);
  await expect(tabs).toHaveAttribute("aria-hidden", "true");
  const box = await tabs.boundingBox();
  const tagline = await page.getByText("A directory for your contacts").boundingBox();
  if (!box || !tagline) throw new Error("not laid out");
  expect(box.y + box.height).toBeLessThanOrEqual(tagline.y);
});

test("draws a focused field's border in ink, with the mouse too", async ({ page }) => {
  await page.goto("/login");
  const field = page.getByLabel("Username");
  await field.click();
  const [border, ink] = await field.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--ring)";
    document.body.append(probe);
    const colors = [getComputedStyle(el).borderTopColor, getComputedStyle(probe).color];
    probe.remove();
    return colors;
  });
  expect(border).toBe(ink);
});
