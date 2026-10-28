import { expect, type Page, test } from "@playwright/test";
import { getCard, putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

test.skip(({ isMobile }) => isMobile, "keyboard shortcuts are a desktop matter");

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
  await putCard("alan", vcard(["UID:alan", "FN:Alan Turing", "N:Turing;Alan;;;"]));
  await putCard("grace", vcard(["UID:grace", "FN:Grace Hopper", "N:Hopper;Grace;;;"]));
});

test("walks the list with the arrow keys, in the order shown", async ({ page }) => {
  await signIn(page);
  // By first name: Ada, Alan, Grace.
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/contacts\/contacts\/ada$/);
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/contacts\/contacts\/alan$/);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/contacts\/contacts\/grace$/);
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(/\/contacts\/contacts\/alan$/);
  await expect(page.getByRole("heading", { level: 1, name: /Turing/ })).toBeVisible();
});

test("moves on from where a key just went, however fast they come", async ({ page }) => {
  await signIn(page);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/contacts\/contacts\/grace$/);
});

test("hands a focused row's focus on to the next one", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /Lovelace/ }).click();
  await expect(page).toHaveURL(/\/contacts\/contacts\/ada$/);
  await page.getByRole("link", { name: /Lovelace/ }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/contacts\/contacts\/alan$/);
  await expect(page.getByRole("link", { name: /Turing/ })).toBeFocused();
});

test("leaves the arrow keys to the search field", async ({ page }) => {
  await signIn(page);
  await page.keyboard.press("/");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("n");
  await expect(page).toHaveURL(/\/contacts\/contacts$/);
  await expect(page.getByRole("searchbox")).toHaveValue("n");
});

test("opens a new contact with N", async ({ page }) => {
  await signIn(page);
  await page.keyboard.press("n");
  await expect(page).toHaveURL(/\/contacts\/contacts\/new$/);
});

test("saves with Ctrl+Enter from a field", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /Lovelace/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Lovelace/ })).toBeVisible();
  await page.keyboard.press("e");
  const org = page.getByRole("textbox", { name: "Organisation" });
  await org.fill("Analytical Engine");
  await org.press("Control+Enter");
  await expect(page.getByText("Saved")).toBeVisible();
  expect(await getCard("ada")).toContain("ORG:Analytical Engine");
});

test("lists the shortcuts with ?, and gives the focus back on Esc", async ({ page }) => {
  await signIn(page);
  const row = page.getByRole("link", { name: /Lovelace/ });
  await row.focus();
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await expect(dialog.getByText("Previous or next contact")).toBeVisible();

  // Nothing behind the dialog reacts to its keys.
  await page.keyboard.press("n");
  await expect(page).toHaveURL(/\/contacts\/contacts$/);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(row).toBeFocused();
});

test("closes the shortcuts with Esc after a click inside them", async ({ page }) => {
  await signIn(page);
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await dialog.getByText("New contact").click();
  await page.keyboard.press("e");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/contacts\/contacts$/);
});

test("asks before an arrow key leaves an unsaved edit", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /Lovelace/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Lovelace/ })).toBeVisible();
  await page.keyboard.press("e");
  await page.getByRole("textbox", { name: "Organisation" }).fill("Analytical Engine");
  await page.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("ArrowDown");
  const discard = page.getByRole("dialog", { name: "Discard changes?" });
  await expect(discard).toBeVisible();
  // Saving is not something to do from behind the dialog.
  await page.keyboard.press("Control+Enter");
  await discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/contacts\/contacts\/ada\?edit=true$/);
  expect(await getCard("ada")).not.toContain("Analytical");
});

test("closes only the shortcuts with Esc while editing", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: /Lovelace/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Lovelace/ })).toBeVisible();
  await page.keyboard.press("e");
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).focus();
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
});
