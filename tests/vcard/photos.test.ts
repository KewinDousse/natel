/**
 * Tests for reading, keeping, changing and removing PHOTO (ADR 023).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { canReplacePhoto, newContact, parse, photoOf, serialise, sniffImageType } from "@/vcard";
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

  it("writes a 4.0 data URI read with or without its comma escaped as ical.js does", () => {
    for (const value of [
      `data:image/png;base64,${bytes.png}`,
      `data:image/png;base64\\,${bytes.png}`,
    ]) {
      const contact = card(["VERSION:4.0", "FN:X", `item1.PHOTO:${value}`, `LOGO:${value}`]);
      contact.fields.note = "edited";
      const first = serialise(contact);
      expect(photoLines(first)).toEqual([`item1.PHOTO:data:image/png;base64\\,${bytes.png}`]);
      expect(unfold(first)).toContain(`LOGO:data:image/png;base64\\,${bytes.png}`);
      const again = parse(first);
      again.fields.note = "again";
      expect(photoLines(serialise(again))).toEqual(photoLines(first));
    }
  });

  it("writes a 4.0 data URI stored with its semicolon escaped as ical.js writes it", () => {
    // As Radicale stores it.
    const value = `data:image/png\\;base64\\,${bytes.png}`;
    const contact = card(["VERSION:4.0", "FN:X", `item1.PHOTO:${value}`, `LOGO:${value}`]);
    contact.fields.note = "edited";
    const text = serialise(contact);
    expect(photoLines(text)).toEqual([`item1.PHOTO:data:image/png;base64\\,${bytes.png}`]);
    expect(unfold(text)).toContain(`LOGO:data:image/png;base64\\,${bytes.png}`);
    expect(photoOf(parse(text))?.base64).toBe(bytes.png);
  });

  it("repairs a 4.0 data URI whose escaped semicolon an earlier save made grow", () => {
    const contact = card([
      "VERSION:4.0",
      "FN:X",
      `PHOTO:data:image/png\\\\\\;base64\\,${bytes.png}`,
    ]);
    contact.fields.note = "edited";
    expect(photoLines(serialise(contact))).toEqual([`PHOTO:data:image/png;base64\\,${bytes.png}`]);
  });

  it("copies a 3.0 uri photo as written", () => {
    const line = `PHOTO;VALUE=URI:data:image/png\\;base64,${bytes.png}`;
    const contact = card(["VERSION:3.0", "FN:X", line]);
    contact.fields.note = "edited";
    expect(photoLines(serialise(contact))).toEqual([line]);
  });

  it("leaves a 3.0 card's data URI as ical.js writes it", () => {
    const contact = card(["VERSION:3.0", "FN:X", `PHOTO:data:image/png;base64,${bytes.png}`]);
    expect(unfold(serialise(contact))).toContain(`PHOTO:data:image/png;base64,${bytes.png}`);
  });
});

describe("changing and removing photos", () => {
  const replaced = { kind: "replaced", mediaType: "image/png", base64: bytes.png } as const;

  it("replaces every PHOTO of a 3.0 card with one carrying only ENCODING and TYPE", () => {
    const source = fixture("photo-apple-v3.vcf").replace(
      "END:VCARD",
      "PHOTO;VALUE=uri:https://example.org/a.jpg\r\nEND:VCARD",
    );
    expect(photoLines(source)).toHaveLength(2);
    const contact = parse(source);
    contact.fields.photo = replaced;
    const text = serialise(contact);
    expect(photoLines(text)).toEqual([`PHOTO;ENCODING=b;TYPE=PNG:${bytes.png}`]);
    expect(photoOf(parse(text))).toEqual({ mediaType: "image/png", base64: bytes.png });
  });

  it("writes the TYPE of each format a new photo can have", () => {
    for (const [mediaType, type] of [
      ["image/jpeg", "JPEG"],
      ["image/gif", "GIF"],
      ["image/webp", "WEBP"],
    ] as const) {
      const contact = card(["VERSION:3.0", "FN:X"]);
      contact.fields.photo = { kind: "replaced", mediaType, base64: bytes.jpeg };
      expect(photoLines(serialise(contact))).toEqual([
        `PHOTO;ENCODING=b;TYPE=${type}:${bytes.jpeg}`,
      ]);
    }
  });

  it("removes every PHOTO, and leaves LOGO alone", () => {
    const contact = card([
      "VERSION:3.0",
      "FN:X",
      `PHOTO;ENCODING=b;TYPE=PNG:${bytes.png}`,
      "item1.PHOTO;VALUE=uri:https://example.org/a.jpg",
      `LOGO;ENCODING=b;TYPE=PNG:${bytes.png}`,
    ]);
    contact.fields.photo = { kind: "removed" };
    const text = serialise(contact);
    expect(photoLines(text)).toEqual([]);
    expect(unfold(text)).toContain(`LOGO;ENCODING=b;TYPE=PNG:${bytes.png}`);
  });

  it("removes the photos of a 4.0 card", () => {
    const removed = parse(fixture("photo-davx5-v4.vcf"));
    removed.fields.photo = { kind: "removed" };
    expect(photoLines(serialise(removed))).toEqual([]);
  });

  it("replaces every PHOTO of a 4.0 card with a data URI whose comma ical.js escapes", () => {
    const source = fixture("photo-davx5-v4.vcf").replace(
      "END:VCARD",
      "PHOTO;MEDIATYPE=image/jpeg:https://example.org/a.jpg\r\nEND:VCARD",
    );
    expect(photoLines(source)).toHaveLength(2);
    const v4 = parse(source);
    expect(canReplacePhoto(v4)).toBe(true);
    v4.fields.photo = replaced;
    const text = serialise(v4);
    expect(photoLines(text)).toEqual([`PHOTO:data:image/png;base64\\,${bytes.png}`]);
    expect(unfold(text)).toMatch(/^VERSION:4\.0$/m);
    expect(photoOf(parse(text))).toEqual({ mediaType: "image/png", base64: bytes.png });
  });

  it("writes the media type of each format a new photo can have on a 4.0 card", () => {
    for (const mediaType of ["image/jpeg", "image/gif", "image/webp"] as const) {
      const contact = card(["VERSION:4.0", "FN:X"]);
      contact.fields.photo = { kind: "replaced", mediaType, base64: bytes.jpeg };
      const text = serialise(contact);
      expect(photoLines(text)).toEqual([`PHOTO:data:${mediaType};base64\\,${bytes.jpeg}`]);
      expect(photoOf(parse(text))).toEqual({ mediaType, base64: bytes.jpeg });
    }
  });

  it("keeps a new 4.0 photo as written when the next save edits another field", () => {
    const contact = card(["VERSION:4.0", "FN:X"]);
    contact.fields.photo = replaced;
    const first = serialise(contact);
    const again = parse(first);
    again.fields.note = "edited";
    expect(photoLines(serialise(again))).toEqual(photoLines(first));
  });

  it("offers a new photo to no card but 3.0 and 4.0", () => {
    for (const other of [card(["VERSION:2.1", "FN:X"]), card(["FN:X"])]) {
      expect(canReplacePhoto(other)).toBe(false);
      other.fields.photo = replaced;
      expect(() => serialise(other)).toThrow(/3\.0 or 4\.0/);
    }
  });

  it("leaves a photo as written when the next save edits another field", () => {
    const contact = parse(fixture("photo-apple-v3.vcf"));
    contact.fields.photo = replaced;
    const first = serialise(contact);
    // As the save hooks cache it once written.
    contact.fields.photo = { kind: "unchanged" };
    contact.fields.note = "edited";
    expect(photoLines(serialise(contact))).toEqual(photoLines(first));
  });

  it("lets a 3.0 card and a new contact take a new photo", () => {
    expect(canReplacePhoto(parse(fixture("photo-apple-v3.vcf")))).toBe(true);
    const created = newContact();
    expect(canReplacePhoto(created)).toBe(true);
    created.fields.photo = replaced;
    expect(photoOf(parse(serialise(created)))?.base64).toBe(bytes.png);
  });
});
