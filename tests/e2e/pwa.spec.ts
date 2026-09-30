import { expect, test } from "@playwright/test";

test.skip(({ isMobile }) => isMobile, "the manifest doesn't depend on the viewport");

test("links a manifest whose icons are served at their stated size", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const response = await request.get(href ?? "");
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({ name: "Natel", display: "standalone", start_url: "./" });
  const purposes = manifest.icons.map((icon: { purpose?: string }) => icon.purpose ?? "any");
  expect(purposes).toContain("maskable");

  for (const icon of manifest.icons as { src: string; sizes: string }[]) {
    const response = await request.get(new URL(icon.src, new URL(href ?? "", page.url())).href);
    expect(response.headers()["content-type"], icon.src).toContain("image/png");
    const [width, height] = icon.sizes.split("x").map(Number);
    // PNG header: width and height are big-endian at bytes 16 and 20.
    const png = await response.body();
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], icon.src).toEqual([width, height]);
  }

  // A missing file would still answer 200 with index.html: check the type.
  const types: Record<string, RegExp> = {
    "/favicon.ico": /image\/(x-icon|vnd\.microsoft\.icon)/,
    "/favicon.svg": /image\/svg\+xml/,
    "/icons/apple-touch-icon.png": /image\/png/,
  };
  for (const link of await page.locator('link[rel="icon"], link[rel="apple-touch-icon"]').all()) {
    const linkHref = (await link.getAttribute("href")) ?? "";
    const type = (await request.get(linkHref)).headers()["content-type"];
    expect(type, linkHref).toMatch(types[linkHref] ?? /^image\//);
  }
});
