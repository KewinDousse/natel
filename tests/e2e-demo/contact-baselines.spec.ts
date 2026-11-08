import { expect, type Locator, test } from "@playwright/test";

/** The y of the first text line's baseline, read from an empty inline-block sitting on it. */
function baselineOf(element: Locator) {
  return element.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && text.textContent?.trim() === "") text = walker.nextNode();
    if (!text) throw new Error("No text");
    const wrapper = document.createElement("span");
    const probe = document.createElement("span");
    probe.style.display = "inline-block";
    text.parentNode?.insertBefore(wrapper, text);
    wrapper.append(probe, text);
    const y = probe.getBoundingClientRect().bottom;
    text.parentNode?.parentNode?.insertBefore(text, wrapper);
    wrapper.remove();
    return y;
  });
}

test("sets each section title on the baseline of its first line", async ({ page, isMobile }) => {
  test.skip(isMobile, "Below xl, titles sit above the rows.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("./contacts/runeterra/p01");
  const sections = page.getByRole("article").locator("section");
  await expect(sections.first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const titled = await sections.count();
  expect(titled).toBeGreaterThanOrEqual(5);
  for (let index = 0; index < titled; index++) {
    const section = sections.nth(index);
    const title = await baselineOf(section.getByRole("heading"));
    // With labels beside values (Auto, the default), the first line is the label's and the value's.
    const firstLine = await baselineOf(section.locator("> div").nth(1));
    expect(Math.abs(title - firstLine), (await section.textContent()) ?? "").toBeLessThan(1);
  }
});
