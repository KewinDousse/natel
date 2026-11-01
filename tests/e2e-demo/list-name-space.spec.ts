import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";

async function loadCases(page: Page) {
  const cards = await Promise.all(
    ["long-contact-identity.vcf", "long-organisation-list.vcf", "long-email-list.vcf"].map((name) =>
      readFile(resolve(import.meta.dirname, "../fixtures/public", name), "utf8"),
    ),
  );
  await page.goto("./contacts/runeterra");
  await page.locator('input[type="file"][accept*="vcf"]').setInputFiles({
    name: "list-cases.vcf",
    mimeType: "text/vcard",
    buffer: Buffer.from(cards.join("\n")),
  });
  await page.getByRole("button", { name: "Import 3 contacts", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
  return {
    long: page.locator('a[data-contact-id="identity-long-name"]'),
    organisation: page.getByRole("link", { name: /^Atelier des Rives et des Montagnes/ }),
    email: page.getByRole("link", { name: /^Émilie Favre/ }),
    short: page.getByRole("link", { name: /^Caitlyn Kiramman/ }),
  };
}

function dimensions(row: Locator) {
  return row.evaluate((element) => {
    const name = element.querySelector<HTMLElement>("span[title]");
    const content = name?.parentElement;
    const value = content?.lastElementChild;
    if (!name || !content || !(value instanceof HTMLElement)) throw new Error("Missing row fields");
    return {
      content: content.clientWidth,
      name: name.clientWidth,
      fullName: name.scrollWidth,
      value: value.getBoundingClientRect().width,
      fullValue: value.scrollWidth,
      gap: Number.parseFloat(getComputedStyle(content).columnGap) || 0,
      nameBottom: name.getBoundingClientRect().bottom,
      valueTop: value.getBoundingClientRect().top,
    };
  });
}

test("gives long names the leader's space while preserving values and the mobile layout", async ({
  page,
}) => {
  const rows = await loadCases(page);
  let paneWidth: number | undefined;
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const pane = await page
      .getByRole("navigation", { name: "Contacts", exact: true })
      .boundingBox();
    if (!pane) throw new Error("Missing list bounds");
    paneWidth ??= pane.width;
    expect(pane.width).toBe(paneWidth);
    for (const row of [rows.long, rows.organisation]) {
      await expect(row.locator(".leader")).toBeHidden();
      await expect(async () => {
        const size = await dimensions(row);
        expect(Math.abs(size.name - (size.content - size.value - size.gap))).toBeLessThan(1);
        expect(size.fullName).toBeGreaterThan(size.name);
      }).toPass();
    }
    await expect(rows.short.locator(".leader")).toBeVisible();
    const email = await dimensions(rows.email);
    expect(email.value).toBeLessThanOrEqual(email.content * 0.42 + 1);
    expect(email.fullValue).toBeGreaterThan(email.value);
    await expect(rows.long.locator("span[title]")).toHaveAttribute(
      "title",
      "Alexandrine de Montmollin-Bernasconi",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const row of Object.values(rows)) {
    await expect(row.locator(".leader")).toBeHidden();
    const size = await dimensions(row);
    expect(size.nameBottom).toBeLessThanOrEqual(size.valueTop);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("restores leaders when space returns and keeps sorting and search working", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { long } = await loadCases(page);
  for (const [width, visible] of [
    [1024, false],
    [900, true],
    [1024, false],
    [390, false],
    [1440, false],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    if (visible) await expect(long.locator(".leader")).toBeVisible();
    else await expect(long.locator(".leader")).toBeHidden();
  }
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.getByRole("button", { name: "Last name", exact: true }).click();
  await expect(long.locator("span[title]")).toHaveAttribute(
    "title",
    "de Montmollin-Bernasconi Alexandrine",
  );
  await expect(long.locator(".leader")).toBeVisible();
  await page.getByRole("searchbox").fill("Montmollin");
  await expect(long.locator("mark")).not.toHaveCount(0);
  await expect(long).toBeVisible();
  expect(errors).toEqual([]);
});
