import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

async function signIn(page: Page): Promise<void> {
  await expect(page.getByText("Demo: any username and password work.")).toBeVisible();
  await expect(page.getByText("In this demo, nothing you type leaves your browser.")).toBeVisible();
  await page.getByLabel("Username").fill("visitor");
  await page.getByLabel("Password", { exact: true }).fill("anything");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: /Luxanna Crownguard/ })).toBeVisible();
}

test("keeps the demo out of search results before JavaScript runs", async ({ request }) => {
  for (const path of ["./", "./contacts.html", "./404.html"]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toMatch(
      /<meta\s+name="robots"\s+content="noindex, follow"\s*\/?\s*>/,
    );
  }
});

test("signs in with any credentials, and says on every screen that it is a demo", async ({
  page,
}) => {
  await page.goto("./");
  await signIn(page);
  await expect(page.getByText("Demo: nothing is saved, change anything you like.")).toBeVisible();
  await page.getByRole("link", { name: /Luxanna Crownguard/ }).click();
  await expect(page).toHaveURL(/\/contacts\/runeterra\/p01$/);
  await expect(page.getByText("Demo", { exact: true }).filter({ visible: true })).toBeVisible();
});

// A static host sends no headers: the policy, Trusted Types included, comes
// from the meta tag, which `vite preview`'s own headers would hide here.
test("carries the content security policy in a meta tag", async ({ page, isMobile }) => {
  test.skip(isMobile, "the policy doesn't depend on the viewport");
  await page.goto("./");
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("require-trusted-types-for 'script'; trusted-types 'none'");
});

test("gives link previews an absolute image it serves", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "the tags don't depend on the viewport");
  await page.goto("./");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toBe(new URL("og-image.png", page.url()).href);
  const response = await request.get(image ?? "");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("image/png");
});

test("opens the contact list directly without signing in", async ({ page }) => {
  await page.goto("./contacts");
  await expect(page).toHaveURL(/\/contacts\/runeterra$/);
  await expect(page.getByRole("link", { name: /Luxanna Crownguard/ })).toBeVisible();
  await expect(page.getByText("Demo: nothing is saved, change anything you like.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).not.toBeVisible();
});

test("ships the contact list as a page of its own", async ({ request }) => {
  const response = await request.get("./contacts.html");
  expect(response.ok()).toBe(true);
});

test("opens a contact deep link directly without signing in", async ({ page }) => {
  await page.goto("./contacts/runeterra/p01");
  await expect(page).toHaveURL(/\/contacts\/runeterra\/p01$/);
  await expect(page.getByRole("heading", { name: /Luxanna Crownguard/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).not.toBeVisible();
});

test("signs out of a session opened by a direct link", async ({ page }) => {
  await page.goto("./settings");
  await expect(page.getByText("demo", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
});

test("forgets an edit on reload", async ({ page }) => {
  await page.goto("./");
  await signIn(page);
  await page.getByRole("link", { name: /Luxanna Crownguard/ }).click();
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await page.locator('input[type="tel"]').first().fill("+41 79 000 99 99");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "079 000 99 99" }).first()).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/contacts\/runeterra\/p01$/);
  await expect(page.getByRole("link", { name: "079 000 00 01" }).first()).toBeVisible();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`passes axe on the demo's own screens, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("./");
    const check = async (screen: string) => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        .exclude("[data-logotype]")
        .analyze();
      expect
        .soft(
          violations.map((v) => v.id),
          screen,
        )
        .toEqual([]);
    };
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await check("sign-in");
    await signIn(page);
    await check("list");
  });
}

test("aligns copy and edit controls beside desktop contact values", async ({ page, isMobile }) => {
  test.skip(isMobile, "the desktop reading layout has inline edit controls");
  await page.goto("./contacts/runeterra/p03");
  for (const id of ["sec-tel", "sec-email", "sec-bday"]) {
    const section = page.locator(`#${id}`);
    await section.hover();
    const copy = section.getByRole("button", { name: /^Copy/ });
    const edit = section.getByRole("button", { name: /^Edit/ });
    await expect(copy).toBeVisible();
    await expect(edit).toBeVisible();
    const copyBox = await copy.boundingBox();
    const editBox = await edit.boundingBox();
    expect(copyBox).not.toBeNull();
    expect(editBox).not.toBeNull();
    if (!copyBox || !editBox) throw new Error("Missing contact control bounds");
    expect(Math.abs(copyBox.y + copyBox.height / 2 - editBox.y - editBox.height / 2)).toBeLessThan(
      1,
    );
  }
  await page.goto("./contacts/runeterra/p02");
  const note = page.locator("#sec-note");
  await note.hover();
  const noteValue = await note.locator("[data-contact-value]").boundingBox();
  const noteEdit = await note.getByRole("button", { name: "Edit note" }).boundingBox();
  if (!noteValue || !noteEdit) throw new Error("Missing note bounds");
  expect(
    Math.abs(noteValue.y + noteValue.height / 2 - noteEdit.y - noteEdit.height / 2),
  ).toBeLessThan(1);
  await note.getByRole("button", { name: "Edit note" }).click();
  await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeFocused();
});

test("keeps a contact's phone number whole until the title column fits", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "phones show one pane at a time");
  await page.setViewportSize({ width: 1024, height: 800 });
  for (const position of ["auto", "left"]) {
    await page.goto("./settings");
    await page.getByRole("combobox", { name: "Label position" }).selectOption(position);
    await page.goto("./contacts/runeterra/p03");
    const section = page.locator("#sec-tel");
    const phone = section.locator("[data-contact-value] a").first();
    await expect(phone).toBeVisible();
    expect(await phone.evaluate((link) => link.scrollWidth <= link.clientWidth)).toBe(true);
    const label = await section.locator("[data-contact-label]").first().boundingBox();
    const value = await section.locator("[data-contact-value]").first().boundingBox();
    if (!label || !value) throw new Error("Missing row label or value bounds");
    if (position === "auto") expect(label.y + label.height).toBeLessThanOrEqual(value.y);
    else expect(label.x + label.width).toBeLessThanOrEqual(value.x);
  }
  const section = page.locator("#sec-tel");
  await page.setViewportSize({ width: 1279, height: 800 });
  await expect(section).toHaveCSS("display", "block");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(section).toHaveCSS("display", "grid");
  const phone = section.locator("[data-contact-value] a").first();
  expect(await phone.evaluate((link) => link.scrollWidth <= link.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 1024, height: 800 });
  await expect(section).toHaveCSS("display", "block");
  await section.hover();
  await section.getByRole("button", { name: /^Edit/ }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
});

test("previews and remembers the position of row labels independently of section titles", async ({
  page,
  isMobile,
}) => {
  async function expectLabelPosition(container: Locator, above: boolean) {
    const label = await container.locator("[data-contact-label]").first().boundingBox();
    const value = await container.locator("[data-contact-value]").first().boundingBox();
    if (!label || !value) throw new Error("Missing row label or value bounds");
    if (above) {
      expect(label.y + label.height).toBeLessThanOrEqual(value.y);
      expect(Math.abs(label.x - value.x)).toBeLessThan(1);
    } else {
      expect(label.x + label.width).toBeLessThanOrEqual(value.x);
      expect(Math.abs(label.y - value.y)).toBeLessThan(10);
    }
  }
  for (const position of ["left", "above", "auto"]) {
    await page.goto("./settings");
    const select = page.getByRole("combobox", { name: "Label position" });
    await select.selectOption(position);
    const above = position === "above" || (position === "auto" && isMobile);
    await expectLabelPosition(page.getByRole("figure", { name: "Preview" }), above);
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Label position" })).toHaveValue(position);
    await expectLabelPosition(page.getByRole("figure", { name: "Preview" }), above);
    await page.goto("./contacts/runeterra/p03");
    const section = page.locator("#sec-tel");
    await expectLabelPosition(section, above);
    await expect(section).toHaveCSS("display", isMobile ? "block" : "grid");
    await section.hover();
    if (!isMobile) {
      const edit = await section.getByRole("button", { name: /^Edit/ }).boundingBox();
      const copy = await section.getByRole("button", { name: /^Copy/ }).boundingBox();
      if (!copy || !edit) throw new Error("Missing control bounds");
      expect(Math.abs(copy.y + copy.height / 2 - edit.y - edit.height / 2)).toBeLessThan(1);
    }
  }
  expect(await page.evaluate(() => localStorage.getItem("natel.preferences"))).toBeNull();
});

test("keeps compact initials beside the name and preserves photo size", async ({
  page,
  isMobile,
}) => {
  for (const [id, photo] of [
    ["p03", false],
    ["p01", true],
  ] as const) {
    await page.goto(`./contacts/runeterra/${id}`);
    const identity = page.locator("[data-contact-identity]");
    const avatar = identity.locator(":scope > img, :scope > span");
    const name = identity.locator('p[aria-hidden="true"]');
    await expect(avatar).toBeVisible();
    const avatarBox = await avatar.boundingBox();
    const nameBox = await name.boundingBox();
    if (!avatarBox || !nameBox) throw new Error("Missing identity bounds");
    expect(avatarBox.width).toBe(photo ? (isMobile ? 96 : 112) : 64);
    expect(avatarBox.height).toBe(avatarBox.width);
    expect(avatarBox.x + avatarBox.width).toBeLessThanOrEqual(nameBox.x);
    if (photo) {
      await expect(avatar).toHaveJSProperty("complete", true);
      expect(
        await avatar.evaluate(
          (element) => element instanceof HTMLImageElement && element.naturalWidth > 0,
        ),
      ).toBe(true);
      await expect(avatar).toHaveCSS("filter", "none");
    }
    await page
      .getByRole("button", { name: /^Edit(?: \(E\))?$/ })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
    if (photo) await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
});

test("wraps long names and organisations beside compact initials", async ({ page }) => {
  await page.goto("./contacts/runeterra/p03");
  await page
    .locator('input[type="file"][accept*="vcf"]')
    .setInputFiles(resolve(import.meta.dirname, "../fixtures/public/long-contact-identity.vcf"));
  await page.getByRole("button", { name: "Import 1 contact", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: /Alexandrine/ }).click();
  const identity = page.locator("[data-contact-identity]");
  await expect(identity).toContainText("Alexandrine de Montmollin-Bernasconi");
  await expect(identity).toContainText("Atelier des Rives et des Montagnes");
  expect(await identity.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
