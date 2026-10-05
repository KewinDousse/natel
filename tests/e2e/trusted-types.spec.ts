import { expect, test } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "the policy doesn't depend on the viewport");

// The Caddyfile's policy, which Vite's preview sends too: no string becomes
// markup, whatever a card holds.
test("refuses a string in an HTML sink", async ({ page }) => {
  await page.goto("/");
  const sinks = await page.evaluate(() => {
    const tries: Record<string, () => void> = {
      innerHTML: () => {
        document.createElement("div").innerHTML = "<b>card</b>";
      },
      insertAdjacentHTML: () => {
        document.body.insertAdjacentHTML("beforeend", "<b>card</b>");
      },
    };
    return Object.fromEntries(
      Object.entries(tries).map(([name, run]) => {
        try {
          run();
          return [name, "allowed"];
        } catch (err) {
          const refused = err instanceof TypeError && /TrustedHTML/.test(err.message);
          return [name, refused ? "refused" : String(err)];
        }
      }),
    );
  });
  expect(sinks).toEqual({ innerHTML: "refused", insertAdjacentHTML: "refused" });
});
