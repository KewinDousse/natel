import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { getCard, putCard, resetBook, vcard } from "./dav";
import { PASSWORD, SERVER_NAME, USER } from "./env";

const bytes = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../vcard/photo-bytes.json"), "utf8"),
) as Record<string, string>;
const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, "../fixtures/public", name), "utf8");

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel(/^(Username|Nom d’utilisateur)$/).fill(USER);
  await page.getByLabel(/^(Password|Mot de passe)$/).fill(PASSWORD);
  await page.getByRole("button", { name: /^(Sign in|Se connecter)$/ }).click();
  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
}

const loaded = (page: Page, where: string) =>
  page
    .locator(`${where} img`)
    .evaluateAll((imgs) =>
      imgs.map(
        (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
      ),
    );

test.beforeEach(async () => {
  await resetBook();
});

test("shows the photos real clients write, in the list and on the page", async ({ page }) => {
  await putCard("apple", fixture("photo-apple-v3.vcf"));
  await putCard("webp", fixture("photo-webp.vcf"));
  // A 4.0 data URI as ical.js writes it; Radicale cuts the unescaped form
  // DAVx⁵ writes at its comma, so that one only goes to the other servers.
  await putCard(
    "grace",
    SERVER_NAME === "radicale"
      ? fixture("photo-davx5-v4.vcf").replace("base64,", "base64\\,")
      : fixture("photo-davx5-v4.vcf"),
  );
  await signIn(page);
  await expect.poll(() => loaded(page, "#list")).toEqual([true, true, true]);

  await page.getByRole("link", { name: /Hopper/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Hopper/ })).toBeVisible();
  await expect.poll(() => loaded(page, "article")).toEqual([true]);
});

test("falls back to the initials when a photo doesn't load", async ({ page }) => {
  const broken = `${(bytes.jpeg ?? "").slice(0, 40)}AAAA`;
  await putCard(
    "ada",
    vcard([
      "UID:ada",
      "FN:Ada Lovelace",
      "N:Lovelace;Ada;;;",
      `PHOTO;ENCODING=b;TYPE=JPEG:${broken}`,
    ]),
  );
  await signIn(page);
  const row = page.getByRole("link", { name: /Lovelace/ });
  await expect(row.getByText("AL", { exact: true })).toBeVisible();
  await expect(row.locator("img")).toHaveCount(0);
});

test("opens the crop dialog and can choose the same photo again", async ({ page }) => {
  await putCard("ada", vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]));
  await signIn(page);
  await page.getByRole("link", { name: /Lovelace/ }).click();
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  const image = {
    name: "camera.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(bytes.jpeg ?? "", "base64"),
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const picker = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Change photo" }).click();
    await (await picker).setFiles(image);
    const dialog = page.getByRole("dialog", { name: "Crop photo" });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.locator("img").evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await dialog.getByRole("button", { name: "Use photo" }).click();
    await expect(dialog).toBeHidden();
  }

  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect.poll(() => getCard("ada")).toMatch(/PHOTO;ENCODING=b;TYPE=JPEG:/);
});
