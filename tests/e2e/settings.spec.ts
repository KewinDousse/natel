import { expect, type Page, test } from "@playwright/test";
import { putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(/^(Username|Nom d’utilisateur)$/).fill(USER);
  await page.getByLabel(/^(Password|Mot de passe)$/).fill(PASSWORD);
  await page.getByRole("button", { name: /^(Sign in|Se connecter)$/ }).click();
  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
}

test.beforeEach(async () => {
  await resetBook();
  await putCard("ada", vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]));
});

test("changes the language at once and remembers it on the next visit", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  const select = page.getByRole("combobox", { name: "Language" });
  await expect(select).toHaveValue("browser");
  await select.selectOption("fr");
  await expect(page.getByRole("heading", { level: 1, name: "Paramètres" })).toBeVisible();

  // A reload signs out; the sign-in screen comes back in French.
  await page.reload();
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("natel.preferences"))).toBe(
    '{"locale":"fr"}',
  );

  await signIn(page);
  await page.getByRole("link", { name: "Paramètres" }).click();
  await page.getByRole("combobox", { name: "Langue" }).selectOption("browser");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("natel.preferences"))).toBeNull();
});

test("goes back to the list with Esc on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "Esc is a desktop shortcut; phones use the back link");
  await signIn(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/contacts\/settings$/);
  // The URL changes before the page is drawn and listens for Esc.
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/contacts$/);
});

test("goes back to the list from the phone's top bar", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the top bar is phone only");
  await signIn(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Back to contacts" }).click();
  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
});

test("asks before leaving an unsaved edit for the settings", async ({ page, isMobile }) => {
  test.skip(isMobile, "the header is hidden while a contact fills a phone's screen");
  await signIn(page);
  await page.getByRole("link", { name: /Lovelace/ }).click();
  await page.getByRole("button", { name: /^Edit/ }).first().click();
  await page.getByLabel("Last name", { exact: true }).fill("Byron");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("picks the language on the sign-in screen", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Language" })
    .filter({ visible: true })
    .selectOption("fr");
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
});
