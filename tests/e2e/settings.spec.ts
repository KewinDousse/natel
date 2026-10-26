import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import packageInfo from "../../package.json" with { type: "json" };
import { putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

const { version } = packageInfo;

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

  // A reload keeps the session; the page comes back in French.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Paramètres" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("natel.preferences"))).toBe(
    '{"locale":"fr"}',
  );

  // Signed out, the sign-in screen is in French too.
  await page.goto("/logout");
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();

  await signIn(page);
  await page.getByRole("link", { name: "Paramètres" }).click();
  await page.getByRole("combobox", { name: "Langue" }).selectOption("browser");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("natel.preferences"))).toBeNull();
});

test("opens addresses in the map the settings choose", async ({ page }) => {
  await putCard(
    "ada",
    vcard([
      "UID:ada",
      "FN:Ada Lovelace",
      "N:Lovelace;Ada;;;",
      "ADR:;;12 St James's Square;London;;;",
    ]),
  );
  await signIn(page);
  await page.getByRole("link", { name: "Settings" }).click();
  const select = page.getByRole("combobox", { name: "Open addresses in" });
  await expect(select).toHaveValue("auto");
  await select.selectOption("geo");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Open addresses in" })).toHaveValue("geo");

  await page.goto("/contacts/ada");
  const link = page.getByRole("link", { name: /on a map$/ });
  await expect(link).toHaveAttribute("href", "geo:0,0?q=12%20St%20James's%20Square%2C%20London");
  await expect(link).not.toHaveAttribute("target");
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

test("shows the running version and safe links to help", async ({ page, isMobile }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText(`Version ${version}`, { exact: false })).toBeVisible();
  const column = page.getByRole("heading", { name: "Settings", level: 1 }).locator("..");
  await expect(column.getByRole("heading", { level: 2 })).toHaveText(
    isMobile
      ? ["Account", "Display", "About and help"]
      : ["Account", "Display", "Keyboard shortcuts", "About and help"],
  );
  const bug = page.getByRole("link", { name: "Report a bug", exact: true });
  await expect(bug).toHaveAttribute(
    "href",
    "https://github.com/KewinDousse/natel/issues/new/choose",
  );
  await expect(bug).toHaveAttribute("target", "_blank");
  await expect(bug).toHaveAttribute("rel", "noopener noreferrer");
  const guide = page.getByRole("link", { name: "User guide (English)", exact: true });
  await expect(guide).toHaveAttribute("href", "/contacts/settings/help");
  await expect(guide).not.toHaveAttribute("target", "_blank");
  await guide.click();
  await expect(page.getByRole("heading", { level: 1, name: "Using Natel" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/\/contacts\/settings\/help$/);
  await expect(page).toHaveTitle("User guide · Natel");
  await expect(page.getByRole("heading", { name: "Concurrent edits" })).toBeVisible();
  await expect(
    page.getByText("Your password stays on the server running Natel", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to settings" }).click();
  await expect(page.getByText("alice", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Language" }).selectOption("fr");
  await expect(page.getByRole("heading", { name: "À propos et aide" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Guide utilisateur (anglais)" })).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`reads the English Markdown guide with French navigation, ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await signIn(page);
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("combobox", { name: "Language" }).selectOption("fr");
    await page.getByRole("link", { name: "Guide utilisateur (anglais)" }).click();
    await expect(page).toHaveURL(/\/contacts\/settings\/help$/);
    await expect(page.getByRole("heading", { level: 1, name: "Using Natel" })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Sign in and sign out" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Concurrent edits" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("link", { name: "Retour aux paramètres" })).toBeVisible();
    const troubleshooting = page.getByRole("link", { name: "troubleshooting", exact: true });
    await expect(troubleshooting).toHaveAttribute(
      "href",
      "https://github.com/KewinDousse/natel/blob/main/docs/troubleshooting.md#photos-and-large-cards",
    );
    await expect(troubleshooting).toHaveAttribute("target", "_blank");
    await expect(troubleshooting).toHaveAttribute("rel", "noopener noreferrer");
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    // Without a session, the guide is behind the sign-in.
    await page.context().clearCookies();
    await page.reload();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Using Natel" })).toHaveCount(0);
  });
}

test("opens contacts whose UID is help", async ({ page }) => {
  await putCard("help", vcard(["UID:help", "FN:Help Example", "N:Example;Help;;;"]));
  await signIn(page);
  await page.getByRole("link", { name: /Help Example/ }).click();
  await expect(page).toHaveURL(/\/contacts\/help$/);
  await expect(page.getByRole("heading", { level: 1, name: "Help Example" })).toBeVisible();
  await page.getByRole("button", { name: /^Edit/ }).first().click();
  await expect(page.getByLabel("Last name", { exact: true })).toHaveValue("Example");
});
