import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { orientationOf, stripMetadata } from "../../src/lib/photo-metadata";

test.skip(({ isMobile }) => isMobile, "decoding doesn't depend on the viewport");

const photos = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../vcard/photo-bytes.json"), "utf8"),
) as Record<string, string>;
const bytes = (base64: string) => Uint8Array.from(Buffer.from(base64, "base64"));
const latin1 = (text: string) => Uint8Array.from(Buffer.from(text, "latin1"));
const concat = (...parts: Uint8Array[]) => Uint8Array.from(Buffer.concat(parts));

/** TIFF with orientation 6 and a GPS pointer, big-endian. */
const TIFF = (() => {
  const b = Buffer.alloc(38);
  b.write("MM", 0, "latin1");
  b.writeUInt16BE(42, 2);
  b.writeUInt32BE(8, 4);
  b.writeUInt16BE(2, 8);
  b.writeUInt16BE(0x0112, 10);
  b.writeUInt16BE(3, 12);
  b.writeUInt32BE(1, 14);
  b.writeUInt16BE(6, 18);
  b.writeUInt16BE(0x8825, 22);
  b.writeUInt16BE(4, 24);
  b.writeUInt32BE(1, 26);
  return Uint8Array.from(b);
})();
const le32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return Uint8Array.from(b);
};
const be32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return Uint8Array.from(b);
};

function rotatedJpeg(): Uint8Array {
  const jpeg = bytes(photos.jpeg ?? "");
  const app1 = concat(Uint8Array.of(0xff, 0xe1, 0, 8 + TIFF.length), latin1("Exif\0\0"), TIFF);
  return concat(jpeg.subarray(0, 20), app1, jpeg.subarray(20));
}

function rotatedPng(): Uint8Array {
  const png = bytes(photos.png ?? "");
  const crc = (data: Uint8Array) => {
    let c = 0xffffffff;
    for (const byte of data) {
      c ^= byte;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const typed = concat(latin1("eXIf"), TIFF);
  const chunk = concat(be32(TIFF.length), typed, be32(crc(typed)));
  return concat(png.subarray(0, 33), chunk, png.subarray(33));
}

function rotatedWebp(): Uint8Array {
  const webp = bytes(photos.webp ?? "");
  const exif = concat(latin1("EXIF"), le32(TIFF.length), TIFF);
  const body = concat(webp.subarray(12), exif);
  body[8] = (body[8] ?? 0) | 0x08;
  return concat(latin1("RIFF"), le32(body.length + 4), latin1("WEBP"), body);
}

const sizeIn = (page: Page, data: Uint8Array, type: string) =>
  page.evaluate(
    async ({ data, type }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type }), {
        imageOrientation: "from-image",
      });
      return [bitmap.width, bitmap.height];
    },
    { data: [...data], type },
  );

test("strips the EXIF block, orientation included, and the image still decodes", async ({
  page,
}) => {
  await page.goto("/");
  for (const [type, file] of [
    ["image/jpeg", rotatedJpeg()],
    ["image/png", rotatedPng()],
    ["image/webp", rotatedWebp()],
  ] as const) {
    expect(orientationOf(file), type).toBe(6);
    const stripped = stripMetadata(file)?.bytes ?? new Uint8Array();
    expect(stripped.length, type).toBeLessThan(file.length);
    expect(orientationOf(stripped), type).toBe(1);
    // The 8 × 6 image, no longer turned: a rotated photo goes through the
    // canvas, never kept with its tag.
    expect(await sizeIn(page, stripped, type), type).toEqual([8, 6]);
  }
});

function simpleWebp(): Uint8Array {
  const webp = bytes(photos.webp ?? "");
  for (let at = 12; at + 8 <= webp.length; ) {
    const length = new DataView(webp.buffer, webp.byteOffset + at + 4).getUint32(0, true);
    if (Buffer.from(webp.subarray(at, at + 4)).toString("latin1") === "VP8 ") {
      const pixels = webp.subarray(at, at + 8 + length + (length % 2));
      return concat(latin1("RIFF"), le32(pixels.length + 4), latin1("WEBP"), pixels);
    }
    at += 8 + length + (length % 2);
  }
  throw new Error("The WebP fixture needs a VP8 image");
}

test("cleans metadata and trailing bytes from a simple WebP that still decodes", async ({
  page,
}) => {
  await page.goto("/");
  const clean = simpleWebp();
  const payload = latin1("GPSLatitude camera owner");
  const xmp = concat(latin1("XMP "), le32(payload.length), payload);
  const body = concat(clean.subarray(12), xmp);
  for (const source of [
    concat(clean, payload),
    concat(latin1("RIFF"), le32(body.length + 4), latin1("WEBP"), body),
  ]) {
    expect(await sizeIn(page, source, "image/webp")).toEqual([8, 6]);
    const stripped = stripMetadata(source)?.bytes ?? new Uint8Array();
    expect(stripped).toEqual(clean);
    expect(await sizeIn(page, stripped, "image/webp")).toEqual([8, 6]);
  }
});
