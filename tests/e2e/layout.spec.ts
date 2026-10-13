import { expect, type Page, test } from "@playwright/test";
import { createBook, EXTRA_BOOK_PATH, putCard, resetBook, vcard } from "./dav";
import { PASSWORD, USER } from "./env";

// Phone widths from small Androids to the Pixel 7 the mobile project uses.
const WIDTHS = [320, 360, 375, 390, 412];

test.skip(({ isMobile }) => !isMobile, "phone layout only");

/** Store the UI language as the settings page does; the next load picks it up. */
async function pickLanguage(page: Page, lang: "en" | "fr"): Promise<void> {
  await page.goto("/");
  await page.evaluate((locale) => {
    localStorage.setItem("natel.preferences", JSON.stringify({ locale }));
  }, lang);
}

async function signIn(page: Page): Promise<void> {
  // The session from an earlier sign-in in the same test would skip the form.
  await page.context().clearCookies();
  await page.goto("/");
  await page.getByLabel(/^(Username|Nom d’utilisateur)$/).fill(USER);
  await page.getByLabel(/^(Password|Mot de passe)$/).fill(PASSWORD);
  await page.getByRole("button", { name: /^(Sign in|Se connecter)$/ }).click();
  await expect(page.getByRole("button", { name: /Address book|Carnet/ })).toBeVisible();
}

// Against clientWidth: on a mobile viewport Chrome widens innerWidth to fit
// wide content, which would hide the overflow this measures.
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.beforeEach(async () => {
  await resetBook();
  await putCard("ada", vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]));
});

test("keeps the header on one row above the search at every phone width, in both languages", async ({
  page,
}) => {
  for (const lang of ["fr", "en"] as const) {
    await pickLanguage(page, lang);
    await signIn(page);
    await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      const plus = await page
        .getByRole("link", { name: /New contact|Nouveau contact/ })
        .boundingBox();
      const search = await page.getByRole("searchbox").boundingBox();
      expect(plus, `${width}px ${lang}`).not.toBeNull();
      expect(search, `${width}px ${lang}`).not.toBeNull();
      if (plus && search) {
        expect(plus.y + plus.height, `${width}px ${lang}`).toBeLessThanOrEqual(search.y);
        // Search sits right under the one 56px row, after the 6px band.
        expect(search.y, `${width}px ${lang}`).toBeLessThan(6 + 56 + 8);
      }
      expect(await horizontalOverflow(page), `${width}px ${lang}`).toBe(0);
    }
  }
});

test("never scrolls sideways on the sign-in, list and contact screens", async ({ page }) => {
  for (const width of WIDTHS) {
    for (const lang of ["en", "fr"] as const) {
      const at = `${width}px ${lang}`;
      await page.setViewportSize({ width, height: 800 });
      await pickLanguage(page, lang);
      await signIn(page);
      await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
      expect(await horizontalOverflow(page), `${at} list`).toBe(0);
      await page.getByRole("button", { name: /Address book|Carnet/ }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      expect(await horizontalOverflow(page), `${at} book menu`).toBe(0);
      await page.keyboard.press("Escape");
      await page.getByRole("link", { name: /^(Settings|Paramètres)$/ }).click();
      await expect(page.getByRole("combobox", { name: /^(Language|Langue)$/ })).toBeVisible();
      expect(await horizontalOverflow(page), `${at} settings`).toBe(0);
      await page.getByRole("link", { name: /^(Back to contacts|Retour aux contacts)$/ }).click();
      await page.getByRole("link", { name: /Lovelace/ }).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeAttached();
      expect(await horizontalOverflow(page), `${at} contact`).toBe(0);
      await page
        .getByRole("button", { name: /^(Edit|Modifier)/ })
        .filter({ visible: true })
        .first()
        .click();
      await expect(page.getByRole("button", { name: /^(Save|Enregistrer)$/ })).toBeVisible();
      expect(await horizontalOverflow(page), `${at} edit`).toBe(0);
      await page.context().clearCookies();
      await page.goto("/");
      await expect(page.getByRole("button", { name: /^(Sign in|Se connecter)$/ })).toBeVisible();
      expect(await horizontalOverflow(page), `${at} sign-in`).toBe(0);
    }
  }
});

test("keeps the book switcher's chevron inside its pill, clear of the actions", async ({
  page,
}) => {
  await signIn(page);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    const trigger = await page.getByRole("button", { name: /Address book|Carnet/ }).boundingBox();
    const chevron = await page
      .getByRole("button", { name: /Address book|Carnet/ })
      .locator("svg")
      .boundingBox();
    const actions = await page.getByRole("link", { name: /^(Settings|Paramètres)$/ }).boundingBox();
    expect(trigger && chevron && actions, `${width}px`).toBeTruthy();
    if (trigger && chevron && actions) {
      expect(chevron.x + chevron.width, `${width}px chevron`).toBeLessThanOrEqual(
        trigger.x + trigger.width + 0.5,
      );
      // Either on the same row and left of the actions, or above them.
      const clear =
        trigger.x + trigger.width <= actions.x || trigger.y + trigger.height <= actions.y;
      expect(clear, `${width}px switcher clear of the actions`).toBe(true);
    }
  }
});

test("keeps the book menu on screen with a long book name", async ({ page }) => {
  await createBook(EXTRA_BOOK_PATH, "Contacts professionnels de l’association genevoise");
  await signIn(page);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.getByRole("button", { name: /Address book|Carnet/ }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = await menu.boundingBox();
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box && box.x >= 0 && box.x + box.width <= clientWidth, `${width}px menu`).toBe(true);
    expect(await horizontalOverflow(page), `${width}px`).toBe(0);
    await page.keyboard.press("Escape");
  }
});

test("matches --header-h to the header's real height", async ({ page }) => {
  await signIn(page);
  for (const width of [...WIDTHS, 344, 359]) {
    await page.setViewportSize({ width, height: 800 });
    const [header, variable] = await page.evaluate(() => {
      const el = document.getElementById("app-header");
      const probe = document.createElement("div");
      probe.style.height = "var(--header-h)";
      document.body.append(probe);
      const measured = [
        el?.getBoundingClientRect().height ?? 0,
        probe.getBoundingClientRect().height,
      ];
      probe.remove();
      return measured;
    });
    expect(Math.abs((header ?? 0) - (variable ?? 0)), `${width}px`).toBeLessThanOrEqual(1);
  }
});
