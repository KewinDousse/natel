import { expect, test } from "@playwright/test";

for (const labelPosition of ["auto", "left", "above"]) {
  test(`aligns copy buttons across repeated fields with labels ${labelPosition}`, async ({
    page,
    isMobile,
  }) => {
    await page.addInitScript((position) => {
      localStorage.setItem("natel.preferences", JSON.stringify({ labelPosition: position }));
    }, labelPosition);
    await page.goto("./contacts/runeterra");
    await page.locator('input[type="file"][accept*="vcf"]').setInputFiles({
      name: "copy-alignment.vcf",
      mimeType: "text/vcard",
      buffer: Buffer.from(
        [
          "BEGIN:VCARD",
          "VERSION:3.0",
          "UID:copy-alignment",
          "FN:Camille Exemple",
          "N:Exemple;Camille;;;",
          "TEL;TYPE=CELL:+41 79 000 11 11",
          "TEL;TYPE=CELL:+41 79 000 11 11",
          "EMAIL;TYPE=HOME:camille@example.org",
          "EMAIL;TYPE=WORK:camille@example.net",
          "ADR;TYPE=HOME:;;Rue des Fleurs 4;Lausanne;;1000;Suisse",
          "ADR;TYPE=WORK:;;Quai 2;Genève;;1200;Suisse",
          "BDAY:1990-05-12",
          "END:VCARD",
          "",
        ].join("\r\n"),
      ),
    });
    await page.getByRole("button", { name: "Import 1 contact", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("link", { name: /Camille Exemple/ }).click();
    const copies = page.getByRole("article").getByRole("button", { name: /^Copy/ });
    if (isMobile) {
      await expect(copies).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Edit phone numbers", exact: true }),
      ).toBeVisible();
      return;
    }

    await expect(copies).toHaveCount(7);
    for (const width of [1024, 1279, 1280, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => document.fonts.ready);
      const positions = await copies.evaluateAll((buttons) =>
        buttons.map((button) => button.getBoundingClientRect().x),
      );
      expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
    }
  });
}
