import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";
import { stripMetadata } from "../../src/lib/photo-metadata";
import { getCard, putCard, resetBook, vcard } from "./dav";
import { PASSWORD, SERVER_NAME, USER } from "./env";

const photos = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../vcard/photo-bytes.json"), "utf8"),
) as Record<string, string>;
const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, "../../fixtures/public", name), "utf8");

/** Chromium's 8 × 6 JPEG with an EXIF block right after SOI: `orientation`, and a GPS tag. */
function jpegWithExif(orientation: number): Buffer {
  const jpeg = Buffer.from(photos.jpeg ?? "", "base64");
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4 + 16);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(2, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  tiff.writeUInt16BE(0x8825, 22);
  tiff.writeUInt16BE(4, 24);
  tiff.writeUInt32BE(1, 26);
  tiff.writeUInt32BE(38, 30);
  tiff.write("GPSLatitude", 38, "latin1");
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from([0xff, 0xe1]),
    length,
    payload,
    jpeg.subarray(2),
  ]);
}
const jpegWithGps = jpegWithExif(1);

/**
 * A PNG whose red grows with x and green with y, so a pixel tells where it
 * came from; with `alpha`, every pixel has that opacity.
 */
function gradientPngOf(width: number, height: number, alpha?: number): Buffer {
  const channels = alpha === undefined ? 3 : 4;
  const rows = Buffer.alloc(height * (1 + width * channels));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * channels);
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + x * channels;
      rows[at] = Math.floor((x * 255) / width);
      rows[at + 1] = Math.floor((y * 255) / height);
      rows[at + 2] = 160;
      if (alpha !== undefined) rows[at + 3] = alpha;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (data: Buffer) => {
    let c = 0xffffffff;
    for (const byte of data) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(typed));
    return Buffer.concat([length, typed, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, channels === 4 ? 6 : 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from("\x89PNG\r\n\x1a\n", "latin1"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const gradientPng = gradientPngOf(640, 420);

async function signIn(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Username").fill(USER);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: /Lovelace/ })).toBeVisible();
}

async function editContact(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("link", { name }).click();
  await page.getByRole("button", { name: /^Edit/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
}

async function choosePhoto(page: Page, buffer: Buffer, name = "photo.jpg"): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Change photo" }).click();
  await (await chooser).setFiles({ name, mimeType: "image/jpeg", buffer });
}

/** The base64 of the card's PHOTO lines, unfolded. */
function photoLines(card: string | null): string[] {
  return (
    (card ?? "")
      .replace(/\r?\n[ \t]/g, "")
      .split(/\r?\n/)
      .filter((line) => /^(?:[\w-]+\.)?PHOTO[;:]/i.test(line))
      // Servers and ical.js differ in a group's case.
      .map((line) => line.replace(/^[\w-]+\./, (group) => group.toLowerCase()))
  );
}

/** PHOTO lines unescaped, as clients read them, whatever the server escaped. */
function decoded(lines: string[]): string[] {
  return lines.map((line) => line.replace(/\\([\\,;])/g, "$1"));
}

async function savedPhoto(page: Page, uid: string): Promise<string[]> {
  await page.getByRole("button", { name: "Save" }).click();
  // The button reads "Saving…" as soon as it is clicked: the toast comes once the PUT landed.
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  return photoLines(await getCard(uid));
}

test.skip(({ isMobile }) => isMobile, "the photo dialog doesn't depend on the viewport");

test.beforeEach(async () => {
  await resetBook();
  await putCard("ada", vcard(["UID:ada", "FN:Ada Lovelace", "N:Lovelace;Ada;;;"]));
});

test("keeps an uncropped JPEG byte for byte, without its GPS location", async ({ page }) => {
  await signIn(page);
  await editContact(page, /Lovelace/);
  await choosePhoto(page, jpegWithGps);
  const dialog = page.getByRole("dialog", { name: "Crop photo" });
  await expect(dialog.getByRole("application", { name: "Photo frame" })).toBeFocused();
  await dialog.getByRole("button", { name: "Use photo" }).click();
  await expect(dialog).toBeHidden();
  // The new photo shows before it is saved.
  await expect(page.locator("article img")).toHaveCount(1);

  const stripped = stripMetadata(Uint8Array.from(jpegWithGps));
  const expected = Buffer.from(stripped?.bytes ?? []).toString("base64");
  expect(await savedPhoto(page, "ada")).toEqual([`PHOTO;ENCODING=b;TYPE=JPEG:${expected}`]);
  expect(Buffer.from(expected, "base64").includes("GPSLatitude")).toBe(false);
  expect(jpegWithGps.includes("GPSLatitude")).toBe(true);
});

test("crops the square the frame shows, at the source's resolution when it fits", async ({
  page,
}) => {
  await signIn(page);
  await editContact(page, /Lovelace/);
  await choosePhoto(page, jpegWithGps);
  const dialog = page.getByRole("dialog", { name: "Crop photo" });
  await dialog.getByRole("slider", { name: "Zoom" }).fill("2");
  await dialog.getByRole("button", { name: "Use photo" }).click();
  await expect(dialog).toBeHidden();

  const [line] = await savedPhoto(page, "ada");
  expect(line).toMatch(/^PHOTO;ENCODING=b;TYPE=JPEG:/);
  const base64 = line?.slice(line.indexOf(":") + 1) ?? "";
  const size = await page.evaluate(async (data) => {
    const blob = new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))]);
    const bitmap = await createImageBitmap(blob);
    return [bitmap.width, bitmap.height];
  }, base64);
  // The 8 × 6 image at 2×: a square half its short side.
  expect(size).toEqual([3, 3]);
});

test("scales a large photo down to 1024 px on its longest side", async ({ page }) => {
  await signIn(page);
  await editContact(page, /Lovelace/);
  await choosePhoto(page, gradientPngOf(2400, 1600), "large.png");
  const dialog = page.getByRole("dialog", { name: "Crop photo" });
  await dialog.getByRole("button", { name: "Use photo" }).click();
  await expect(dialog).toBeHidden();

  const [line] = await savedPhoto(page, "ada");
  expect(line).toMatch(/^PHOTO;ENCODING=b;TYPE=(?:JPEG|PNG):/);
  const base64 = line?.slice(line.indexOf(":") + 1) ?? "";
  const [width, height, red] = await page.evaluate(async (data) => {
    const blob = new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))]);
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context?.drawImage(bitmap, 0, 0);
    const pixel = context?.getImageData(bitmap.width - 1, 0, 1, 1).data;
    return [bitmap.width, bitmap.height, pixel?.[0] ?? 0];
  }, base64);
  expect([width, height]).toEqual([1024, 683]);
  // The right edge still holds the gradient's right edge: scaled, not cropped.
  expect(red).toBeGreaterThan(240);
});

test("keeps a cropped photo with transparency as a PNG", async ({ page }) => {
  await signIn(page);
  await editContact(page, /Lovelace/);
  await choosePhoto(page, gradientPngOf(64, 48, 128), "translucent.png");
  const dialog = page.getByRole("dialog", { name: "Crop photo" });
  await dialog.getByRole("slider", { name: "Zoom" }).fill("2");
  await dialog.getByRole("button", { name: "Use photo" }).click();
  await expect(dialog).toBeHidden();

  const [line] = await savedPhoto(page, "ada");
  expect(line).toMatch(/^PHOTO;ENCODING=b;TYPE=PNG:/);
  const alpha = await page.evaluate(
    async (data) => {
      const blob = new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))]);
      const bitmap = await createImageBitmap(blob);
      const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
      context?.drawImage(bitmap, 0, 0);
      return context?.getImageData(0, 0, 1, 1).data[3] ?? 255;
    },
    line?.slice(line.indexOf(":") + 1) ?? "",
  );
  expect(Math.abs(alpha - 128)).toBeLessThanOrEqual(2);
});

test("applies the EXIF orientation of a rotated photo in the frame and in the card", async ({
  page,
}) => {
  // Tagged orientation 6: shown turned a quarter, 6 × 8.
  const rotated = jpegWithExif(6);
  await signIn(page);
  await editContact(page, /Lovelace/);
  await choosePhoto(page, rotated);
  const dialog = page.getByRole("dialog");
  const box = await dialog.locator("img").boundingBox();
  expect((box?.height ?? 0) / (box?.width ?? 1)).toBeCloseTo(8 / 6, 1);
  await dialog.getByRole("button", { name: "Use photo" }).click();
  await expect(dialog).toBeHidden();

  // Android ignores the tag, so the card gets the image turned, without it.
  const [line] = await savedPhoto(page, "ada");
  expect(line).toMatch(/^PHOTO;ENCODING=b;TYPE=JPEG:/);
  const data = line?.slice(line.indexOf(":") + 1) ?? "";
  expect(Buffer.from(data, "base64").includes("Exif")).toBe(false);
  const size = await page.evaluate(async (data) => {
    const blob = new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))]);
    const bitmap = await createImageBitmap(blob, { imageOrientation: "none" });
    return [bitmap.width, bitmap.height];
  }, data);
  expect(size).toEqual([6, 8]);
});

test("moves the photo the way the arrow keys point", async ({ page }) => {
  await signIn(page);
  await editContact(page, /Lovelace/);
  await choosePhoto(page, gradientPng, "gradient.png");
  const dialog = page.getByRole("dialog", { name: "Crop photo" });
  await dialog.getByRole("slider", { name: "Zoom" }).fill("2");
  const frame = dialog.getByRole("application", { name: "Photo frame" });
  // Moving the photo left brings its right part into the frame: 10 steps of
  // 10 screen px, at the frame's scale of 210 image px across its width.
  const frameWidth = (await frame.boundingBox())?.width ?? 0;
  const shift = (10 * 10 * 210) / frameWidth;
  for (let i = 0; i < 10; i += 1) await frame.press("ArrowLeft");
  await dialog.getByRole("button", { name: "Use photo" }).click();
  await expect(dialog).toBeHidden();

  const [line] = await savedPhoto(page, "ada");
  // A PNG source keeps whichever of PNG and JPEG comes out lighter.
  expect(line).toMatch(/^PHOTO;ENCODING=b;TYPE=(?:PNG|JPEG):/);
  const [width, height, red, green] = await page.evaluate(
    async (data) => {
      const blob = new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))]);
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      context?.drawImage(bitmap, 0, 0);
      const pixel = context?.getImageData(0, 0, 1, 1).data ?? [];
      return [bitmap.width, bitmap.height, pixel[0] ?? 0, pixel[1] ?? 0];
    },
    line?.slice(line.indexOf(":") + 1) ?? "",
  );
  // 2× on 640 × 420: a 210 px square, first centred at x = 215, y = 105.
  expect([width, height]).toEqual([210, 210]);
  // Within JPEG's loss, far short of a pixel from elsewhere in the gradient.
  expect(Math.abs(red - Math.floor(((215 + shift) * 255) / 640))).toBeLessThanOrEqual(8);
  expect(Math.abs(green - Math.floor((105 * 255) / 420))).toBeLessThanOrEqual(8);
});

test("moves the frame with the keyboard, and keeps the image whole once back", async ({ page }) => {
  await signIn(page);
  await editContact(page, /Lovelace/);
  await choosePhoto(page, jpegWithGps);
  const frame = page.getByRole("application", { name: "Photo frame" });
  await frame.press("ArrowLeft");
  await frame.press("ArrowRight");
  await page.getByRole("button", { name: "Use photo" }).click();
  const stripped = stripMetadata(Uint8Array.from(jpegWithGps));
  expect(await savedPhoto(page, "ada")).toEqual([
    `PHOTO;ENCODING=b;TYPE=JPEG:${Buffer.from(stripped?.bytes ?? []).toString("base64")}`,
  ]);
});

test("says so when the image can't be read, and Esc closes only the dialog", async ({ page }) => {
  await signIn(page);
  await editContact(page, /Lovelace/);
  await choosePhoto(page, Buffer.from("not an image"), "notes.jpg");
  const dialog = page.getByRole("dialog", { name: "Crop photo" });
  await expect(dialog.getByRole("alert")).toHaveText(
    "This image can’t be read. Choose another one.",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
});

test("removes every photo", async ({ page }) => {
  await putCard("ada", fixture("photo-apple-v3.vcf").replace(/^UID:.*$/m, "UID:ada"));
  await signIn(page);
  await editContact(page, /Lovelace/);
  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByRole("button", { name: "Remove photo" })).toBeHidden();
  expect(await savedPhoto(page, "ada")).toEqual([]);
});

test("writes a new photo into a vCard 4.0 card as a data URI", async ({ page }) => {
  // sabre/dav serves every card as vCard 3.0 unless asked for 4.0.
  test.skip(SERVER_NAME === "baikal", "Baïkal hands the card over as 3.0");
  await putCard(
    "grace",
    SERVER_NAME === "radicale"
      ? fixture("photo-davx5-v4.vcf").replace("base64,", "base64\\,")
      : fixture("photo-davx5-v4.vcf"),
  );
  await signIn(page);
  await editContact(page, /Hopper/);
  await choosePhoto(page, jpegWithGps);
  const dialog = page.getByRole("dialog", { name: "Crop photo" });
  await dialog.getByRole("button", { name: "Use photo" }).click();
  await expect(dialog).toBeHidden();

  const stripped = stripMetadata(Uint8Array.from(jpegWithGps));
  const expected = Buffer.from(stripped?.bytes ?? []).toString("base64");
  const lines = await savedPhoto(page, "grace");
  // Radicale also escapes the semicolon when it stores the card.
  expect(decoded(lines)).toEqual([`PHOTO:data:image/jpeg;base64,${expected}`]);
  expect(await getCard("grace")).toMatch(/^VERSION:4\.0\r?$/m);
});

test("keeps a vCard 4.0 photo as the server stored it when another field is saved", async ({
  page,
}) => {
  test.skip(SERVER_NAME === "baikal", "Baïkal hands the card over as 3.0");
  await putCard(
    "grace",
    SERVER_NAME === "radicale"
      ? fixture("photo-davx5-v4.vcf").replace("base64,", "base64\\,")
      : fixture("photo-davx5-v4.vcf"),
  );
  // Radicale escapes the semicolon too: `data:image/jpeg\;base64\,…`.
  const stored = photoLines(await getCard("grace"));
  await signIn(page);
  await editContact(page, /Hopper/);
  await page.getByLabel("First name", { exact: true }).fill("Amazing Grace");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => getCard("grace")).toContain("Amazing Grace");
  // Xandikos keeps the comma as the fixture wrote it, and Natel escapes it.
  expect(decoded(photoLines(await getCard("grace")))).toEqual(decoded(stored));
});
