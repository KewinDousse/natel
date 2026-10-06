import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { getCard, listCards, putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

test.skip(({ isMobile }) => isMobile, "the menu and dialog are covered by the layout tests");

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
}

async function openBookMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Address book/ }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test.beforeEach(async () => {
  await resetBook();
  await putCard("ada", vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]));
});

test("exports the book as the server stores it", async ({ page }) => {
  await putCard("odd", vcard(["UID:odd", "FN:Odd One", "N:One;Odd;;;", "X-KEEP;X-P=1:yes"]));
  await signIn(page);
  await openBookMenu(page);
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /^Export/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.vcf$/);
  const text = await readFile((await file.path()) ?? "", "utf8");
  expect(text).toContain(((await getCard("ada")) ?? "").trim());
  expect(text).toContain("X-KEEP;X-P=1:yes");
});

test("imports new cards, skips known ones and reports failures", async ({ page }) => {
  await signIn(page);
  await openBookMenu(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import a .vcf file…" }).click();
  const file = [
    vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]),
    vcard(["UID:grace", "FN:Grace Hopper", "N:Hopper;Grace;;;", "X-KEEP:yes"]),
    vcard(["FN:Alan Turing", "N:Turing;Alan;;;"]),
    vcard(["UID:grace", "FN:Grace Again", "N:Again;Grace;;;"]),
  ].join("");
  await (await chooser).setFiles({
    name: "import.vcf",
    mimeType: "text/vcard",
    buffer: Buffer.from(file),
  });

  const dialog = page.getByRole("dialog", { name: /Import into/ });
  await expect(dialog.getByText("Imported: 2")).toBeVisible();
  await expect(dialog.getByText("Already in the book: 1")).toBeVisible();
  await expect(dialog.getByText("Failed: 1")).toBeVisible();
  await expect(dialog.getByText("Grace Again")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("link", { name: /Hopper/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Turing/ })).toBeVisible();
  expect(await getCard("grace")).toContain("X-KEEP:yes");
  expect((await listCards()).length).toBe(3);
});

test("says so when the file holds no contact", async ({ page }) => {
  await signIn(page);
  await openBookMenu(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import a .vcf file…" }).click();
  await (await chooser).setFiles({
    name: "empty.vcf",
    mimeType: "text/vcard",
    buffer: Buffer.from("nothing here\r\n"),
  });
  await expect(page.getByRole("dialog").getByText("This file contains no contact.")).toBeVisible();
});

test("round-trips a book through export and import", async ({ page }) => {
  await putCard("odd", vcard(["UID:odd", "FN:Odd One", "N:One;Odd;;;", "X-KEEP;X-P=1:yes"]));
  const before = (await listCards()).sort();
  await signIn(page);
  await openBookMenu(page);
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /^Export/ }).click();
  const exported = await readFile((await (await download).path()) ?? "", "utf8");

  await resetBook();
  await page.reload();
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Import waits for the book to load.
  await expect(page.getByText("This address book is empty")).toBeVisible();
  await openBookMenu(page);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Import a .vcf file…" }).click();
  await (await chooser).setFiles({
    name: "Contacts.vcf",
    mimeType: "text/vcard",
    buffer: Buffer.from(exported),
  });
  await expect(page.getByRole("dialog").getByText("Imported: 2")).toBeVisible();
  expect((await listCards()).sort()).toEqual(before);
});

test("offers no export for an empty book", async ({ page }) => {
  await resetBook();
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("This address book is empty")).toBeVisible();
  await openBookMenu(page);
  const exportItem = page.getByRole("menuitem", { name: /^Export/ });
  await expect(exportItem).toHaveAttribute("aria-disabled", "true");
  // aria-disabled items stay clickable in the DOM; nothing may happen.
  await exportItem.click({ force: true });
  await expect(page.getByRole("menu")).toBeVisible();
});

test("imports a card again after it was deleted", async ({ page }) => {
  const grace = vcard(["UID:grace", "FN:Grace Hopper", "N:Hopper;Grace;;;"]);
  const importGrace = async () => {
    await openBookMenu(page);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "Import a .vcf file…" }).click();
    await (await chooser).setFiles({
      name: "grace.vcf",
      mimeType: "text/vcard",
      buffer: Buffer.from(grace),
    });
    const dialog = page.getByRole("dialog", { name: /Import into/ });
    await expect(dialog.getByText("Imported: 1")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
  };

  await signIn(page);
  await importGrace();
  await page.getByRole("link", { name: /Hopper/ }).click();
  await page.getByRole("button", { name: /^Edit/ }).first().click();
  await page.getByRole("button", { name: "Delete contact" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("link", { name: /Hopper/ })).toBeHidden();

  await importGrace();
  await expect(page.getByRole("link", { name: /Hopper/ })).toBeVisible();
});
