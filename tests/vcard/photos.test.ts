/**
 * Tests for reading PHOTO and writing 4.0 data URIs (ADR 023).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse, photoOf, serialise, sniffImageType } from "@/vcard";
import bytes from "./photo-bytes.json";

const card = (lines: string[]) => parse(["BEGIN:VCARD", ...lines, "END:VCARD", ""].join("\r\n"));
const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, "../../fixtures/public", name), "utf8");
const unfold = (text: string) => text.replace(/\r?\n[ \t]/g, "");
const photoLines = (text: string) =>
  unfold(text)
    .split(/\r?\n/)
    .filter((line) => /^(?:[\w-]+\.)?PHOTO[;:]/i.test(line))
    // ical.js writes group prefixes in upper case.
    .map((line) => line.replace(/^[\w-]+\./, (group) => group.toLowerCase()));

describe("photoOf", () => {
  it("reads a 3.0 base64 photo typed by TYPE", () => {
    expect(photoOf(card(["VERSION:3.0", `PHOTO;ENCODING=b;TYPE=JPEG:${bytes.jpeg}`]))).toEqual({
      mediaType: "image/jpeg",
      base64: bytes.jpeg,
    });
    expect(
      photoOf(card(["VERSION:3.0", `PHOTO;ENCODING=BASE64;TYPE=image/webp:${bytes.webp}`])),
    ).toEqual({ mediaType: "image/webp", base64: bytes.webp });
  });

  it("sniffs the type when TYPE names no image type", () => {
    expect(photoOf(card(["VERSION:3.0", `PHOTO;ENCODING=b:${bytes.png}`]))?.mediaType).toBe(
      "image/png",
    );
    expect(
      photoOf(card(["VERSION:3.0", `PHOTO;ENCODING=b;TYPE=X-FOO:${bytes.webp}`]))?.mediaType,
    ).toBe("image/webp");
  });

  it("reads a data URI, in 4.0 and in a 3.0 card without VALUE", () => {
    expect(photoOf(card(["VERSION:4.0", `PHOTO:data:image/png;base64,${bytes.png}`]))).toEqual({
      mediaType: "image/png",
      base64: bytes.png,
    });
    expect(
      photoOf(card(["VERSION:4.0", `PHOTO:data:image/png;base64\\,${bytes.png}`]))?.base64,
    ).toBe(bytes.png);
    // As Radicale stores it.
    expect(
      photoOf(card(["VERSION:4.0", `item1.PHOTO:data:image/png\\;base64\\,${bytes.png}`]))?.base64,
    ).toBe(bytes.png);
    expect(photoOf(card(["VERSION:3.0", `PHOTO:data:image/png;base64,${bytes.png}`]))?.base64).toBe(
      bytes.png,
    );
  });

  it("skips what isn't base64 image data, and takes the next PHOTO", () => {
    expect(photoOf(card(["VERSION:3.0", "PHOTO;VALUE=uri:https://example.com/a.jpg"]))).toBeNull();
    expect(photoOf(card(["VERSION:4.0", "PHOTO:data:image/svg+xml,%3Csvg%3E"]))).toBeNull();
    expect(photoOf(card(["VERSION:3.0", "PHOTO;ENCODING=b:aGVsbG8gd29ybGQ="]))).toBeNull();
    expect(
      photoOf(
        card([
          "VERSION:3.0",
          "PHOTO;VALUE=uri:https://example.com/a.jpg",
          `PHOTO;ENCODING=b;TYPE=PNG:${bytes.png}`,
        ]),
      )?.mediaType,
    ).toBe("image/png");
    expect(photoOf(card(["VERSION:3.0", "FN:X"]))).toBeNull();
  });

  it("reads the fixtures in the shapes real clients write", () => {
    expect(photoOf(parse(fixture("photo-apple-v3.vcf")))?.mediaType).toBe("image/jpeg");
    expect(photoOf(parse(fixture("photo-davx5-v4.vcf")))?.base64).toBe(bytes.jpeg);
    expect(photoOf(parse(fixture("photo-exif-orientation-6.vcf")))?.mediaType).toBe("image/jpeg");
    expect(photoOf(parse(fixture("photo-webp.vcf")))?.base64).toBe(bytes.webp);
  });
});

describe("sniffImageType", () => {
  it("knows the common formats by their first bytes", () => {
    const of = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
    expect(sniffImageType(of("\xff\xd8\xff\xe0"))).toBe("image/jpeg");
    expect(sniffImageType(of("\x89PNG\r\n\x1a\n"))).toBe("image/png");
    expect(sniffImageType(of("GIF89a"))).toBe("image/gif");
    expect(sniffImageType(of("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(sniffImageType(of("\0\0\0\x1cftypavif"))).toBe("image/avif");
    expect(sniffImageType(of("\0\0\0\x18ftypheic"))).toBe("image/heic");
    expect(sniffImageType(of("hello world"))).toBeNull();
  });
});

describe("writing photos", () => {
  it("keeps every photo byte for byte when another field is edited", () => {
    for (const name of ["photo-apple-v3.vcf", "photo-exif-orientation-6.vcf", "photo-webp.vcf"]) {
      const text = fixture(name);
      const contact = parse(text);
      contact.fields.note = "edited";
      expect(photoLines(serialise(contact))).toEqual(photoLines(text));
    }
  });

  it("keeps a 4.0 data URI's image through an edit", () => {
    const contact = parse(fixture("photo-davx5-v4.vcf"));
    contact.fields.note = "edited";
    expect(photoOf(parse(serialise(contact)))?.base64).toBe(bytes.jpeg);
  });

  it("leaves a 3.0 card's data URI as ical.js writes it", () => {
    const contact = card(["VERSION:3.0", "FN:X", `PHOTO:data:image/png;base64,${bytes.png}`]);
    expect(unfold(serialise(contact))).toContain(`PHOTO:data:image/png;base64,${bytes.png}`);
  });
});
