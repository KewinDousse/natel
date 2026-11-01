import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("adds optional information, validates it and preserves saved values when cancelling", async ({
  page,
}) => {
  const add = async (name: string) => {
    await page.getByRole("button", { name: "Add information", exact: true }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  await page.goto("./contacts/runeterra/new");
  await page.getByLabel("First name", { exact: true }).fill("Camille");
  await expect(page.getByRole("region", { name: "Contact management" })).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Add information", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem").last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await trigger.click();
  await page.getByLabel("First name", { exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  for (const [name, label, value] of [
    ["Add address", "Street", "Rue des Fleurs 4"],
    ["Add birthday", "Day", "12"],
    ["Add website", "Website", "https://example.org"],
    ["Add nickname", "Nickname", "Cam"],
    ["Add note", "Note", "Rappeler lundi"],
  ] as const) {
    await add(name);
    const field = page.getByLabel(label, { exact: true });
    await expect(field).toBeFocused();
    await field.fill(value);
    if (label === "Day") {
      await page.getByLabel("Month", { exact: true }).fill("5");
    }
  }
  await expect(page.getByRole("button", { name: "Add information", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add address", exact: true }).click();
  await expect(page.getByLabel("Street", { exact: true }).last()).toBeFocused();
  await page.getByLabel("Street", { exact: true }).last().fill("Quai 2");
  await page.getByRole("button", { name: "Add phone", exact: true }).click();
  await expect(page.locator("input[type=tel]").last()).toBeFocused();
  await page.locator("input[type=tel]").last().fill("+41 79 000 22 22");
  await page.getByRole("button", { name: "Add email", exact: true }).click();
  await expect(page.locator("input[type=email]").last()).toBeFocused();
  await page.locator("input[type=email]").last().fill("cam@example.org");
  await page.getByLabel("Website", { exact: true }).fill("not-a-url");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Website", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Website", { exact: true }).fill("https://example.org");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page
    .getByRole("button", { name: /^Edit(?: \(E\))?$/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Rappeler lundi");
  await expect(page.getByLabel("Street", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("region", { name: "Contact management" })).toBeVisible();
  await page.getByLabel("Note", { exact: true }).fill("À annuler");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByRole("article")).toHaveAttribute("data-mode", "view");
  await page
    .getByRole("button", { name: /^Edit(?: \(E\))?$/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByLabel("Note", { exact: true })).toHaveValue("Rappeler lundi");
});

test("keeps menu choices above the edit bar in short viewports and returns focus when closed", async ({
  page,
}) => {
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 320 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: 844 });
    await page.goto("./contacts/runeterra/new");
    const trigger = page.getByRole("button", { name: "Add information", exact: true });
    await trigger.click();
    await expect(page.getByRole("menuitem").first()).toBeFocused();
    await trigger.click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.setViewportSize(viewport);
    const menu = page.getByRole("menu", { name: "Add information" });
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .exclude("[data-logotype]")
      .analyze();
    expect(violations.map((violation) => violation.id)).toEqual([]);
    await expect(async () => {
      const box = await menu.boundingBox();
      const bar = await page.locator("[data-contact-edit-bar]").boundingBox();
      if (!box || !bar) throw new Error("Missing menu or edit bar bounds");
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
    }).toPass();
    const note = page.getByRole("menuitem", { name: "Add note", exact: true });
    await note.scrollIntoViewIfNeeded();
    expect(
      await note.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return hit !== null && button.contains(hit);
      }),
    ).toBe(true);
    await note.click();
    await expect(page.getByLabel("Note", { exact: true })).toBeFocused();
  }
});

test("keeps each added field visible above the sticky bar after successive additions", async ({
  page,
}) => {
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 320 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("./contacts/runeterra/new");
    await page.getByLabel("First name", { exact: true }).fill("Camille");
    for (const [name, label, value] of [
      ["Add address", "Street", "Rue des Fleurs 4"],
      ["Add birthday", "Day", "12"],
      ["Add website", "Website", "https://example.org"],
      ["Add nickname", "Nickname", "Cam"],
      ["Add note", "Note", "Rappeler lundi"],
    ] as const) {
      await page.getByRole("button", { name: "Add information", exact: true }).click();
      await page.getByRole("menuitem", { name, exact: true }).click();
      const field = page.getByLabel(label, { exact: true });
      await expect(field).toBeFocused();
      await expect(async () => {
        const box = await field.boundingBox();
        const bar = await page.locator("[data-contact-edit-bar]").boundingBox();
        if (!box || !bar) throw new Error("Missing field or edit bar bounds");
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
        expect(
          await field.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return (
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) ===
              element
            );
          }),
        ).toBe(true);
      }).toPass();
      await field.fill(value);
      if (label === "Day") await page.getByLabel("Month", { exact: true }).fill("5");
    }
  }
});
