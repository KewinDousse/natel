/**
 * Tests for src/lib/photo-metadata.ts (ADR 023), on files built from real
 * Chromium-encoded images with metadata added around their image data.
 */
import { describe, expect, it } from "vitest";
import { formatOf, orientationOf, stripMetadata } from "@/lib/photo-metadata";
import photos from "../vcard/photo-bytes.json";

const decode = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const latin1 = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const has = (bytes: Uint8Array, needle: string) => text(bytes).includes(needle);

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
const be16 = (n: number) => Uint8Array.of(n >> 8, n & 0xff);
const be32 = (n: number) => Uint8Array.of(n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
const le32 = (n: number) => Uint8Array.of(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24);

/** A TIFF block with an orientation and a GPS-like extra entry. */
function tiff(orientation: number, le: boolean): Uint8Array {
  const out = new Uint8Array(8 + 2 + 2 * 12 + 4);
  const view = new DataView(out.buffer);
  out.set(latin1(le ? "II" : "MM"));
  view.setUint16(2, 42, le);
  view.setUint32(4, 8, le);
  view.setUint16(8, 2, le);
  view.setUint16(10, 0x0112, le);
  view.setUint16(12, 3, le);
  view.setUint32(14, 1, le);
  view.setUint16(18, orientation, le);
  view.setUint16(22, 0x8825, le); // GPS IFD pointer
  view.setUint16(24, 4, le);
  view.setUint32(26, 1, le);
  view.setUint32(30, 1234, le);
  return out;
}

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

const jpeg = decode(photos.jpeg);
const seg = (marker: number, payload: Uint8Array) =>
  concat(Uint8Array.of(0xff, marker), be16(payload.length + 2), payload);
/** Chromium's JPEG: SOI, APP0 JFIF (16 + 2 bytes), then the rest. */
const JFIF_END = 4 + ((jpeg[4] ?? 0) << 8) + (jpeg[5] ?? 0);
const imageData = (file: Uint8Array) => {
  // From the first DQT to EOI.
  for (let at = 2; at < file.length; ) {
    if (file[at + 1] === 0xdb) return file.subarray(at, file.lastIndexOf(0xd9) + 1);
    at += 2 + (((file[at + 2] ?? 0) << 8) | (file[at + 3] ?? 0));
  }
  return new Uint8Array();
};

function jpegWith(...extra: Uint8Array[]): Uint8Array {
  const jfif = jpeg.subarray(6, JFIF_END);
  const withThumb = concat(jfif.subarray(0, 12), Uint8Array.of(1, 1, 10, 20, 30));
  return concat(Uint8Array.of(0xff, 0xd8), seg(0xe0, withThumb), ...extra, jpeg.subarray(JFIF_END));
}

describe("JPEG", () => {
  const xmp = latin1("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPSLatitude</x:xmpmeta>");
  const exif = (o: number, le = false) => seg(0xe1, concat(latin1("Exif\0\0"), tiff(o, le)));

  it("keeps the image data and drops EXIF, XMP, comments and the JFIF thumbnail", () => {
    const source = jpegWith(
      exif(6),
      seg(0xe1, xmp),
      seg(0xfe, latin1("taken by a camera")),
      seg(0xed, latin1("Photoshop 3.0\0IPTC")),
      seg(0xe0, latin1("JFXX\0\x13thumb")),
    );
    const result = stripMetadata(source);
    expect(result?.format).toBe("jpeg");
    const out = result?.bytes ?? new Uint8Array();
    expect(imageData(out)).toEqual(imageData(jpeg));
    for (const gone of ["Exif", "GPSLatitude", "taken by a camera", "IPTC", "JFXX"]) {
      expect(has(out, gone)).toBe(false);
    }
    // JFIF stays, with a 0 × 0 thumbnail.
    expect(text(out.subarray(6, 11))).toBe("JFIF\0");
    expect([out[18], out[19]]).toEqual([0, 0]);
    expect((out[4] ?? 0) * 256 + (out[5] ?? 0)).toBe(16);
    expect(orientationOf(source)).toBe(6);
  });

  it("reads the orientation in either byte order, and 1 without one", () => {
    expect(orientationOf(jpegWith(exif(8, true)))).toBe(8);
    expect(orientationOf(jpegWith(exif(1)))).toBe(1);
    expect(orientationOf(jpegWith())).toBe(1);
  });

  it("reads the first of two EXIF segments", () => {
    expect(orientationOf(jpegWith(exif(6), exif(8)))).toBe(6);
  });

  it("reads 1 from a value that neither turns nor flips the image", () => {
    expect(orientationOf(jpegWith(exif(0)))).toBe(1);
    expect(orientationOf(jpegWith(exif(9)))).toBe(1);
  });

  it("reads 1 from a TIFF block cut short or with a wrong byte order", () => {
    const cut = concat(latin1("Exif\0\0"), tiff(6, false).subarray(0, 12));
    expect(orientationOf(jpegWith(seg(0xe1, cut)))).toBe(1);
    const block = tiff(6, false);
    block.set(latin1("XX"));
    expect(orientationOf(jpegWith(seg(0xe1, concat(latin1("Exif\0\0"), block))))).toBe(1);
  });

  it("keeps ICC profiles and Adobe, drops what follows EOI", () => {
    const icc = seg(0xe2, latin1("ICC_PROFILE\0\x01\x01profile"));
    const adobe = seg(0xee, latin1("Adobe\0d\0\0\0\0\x01"));
    const source = concat(jpegWith(icc, adobe), latin1("ftypmp42 a motion photo video"));
    const out = stripMetadata(source)?.bytes ?? new Uint8Array();
    expect(has(out, "ICC_PROFILE\0\x01\x01profile")).toBe(true);
    expect(has(out, "Adobe")).toBe(true);
    expect(has(out, "motion photo")).toBe(false);
    expect(out[out.length - 1]).toBe(0xd9);
  });

  describe("HDR", () => {
    const gainMap = jpeg;
    const hdrXmp = seg(
      0xe1,
      latin1(
        'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/"/>',
      ),
    );
    const isoGainMap = seg(0xe2, concat(latin1("urn:iso:std:iso:ts:21496:-1\0"), be32(0)));
    // MPF: a TIFF header, then an IFD with MPEntry (0xB002) listing two images.
    const mpfFor = (le: boolean, primarySize: number, gainOffset: number) => {
      const body = new Uint8Array(8 + 2 + 12 + 4 + 32);
      const view = new DataView(body.buffer);
      body.set(latin1(le ? "II*\0" : "MM\0*"));
      view.setUint32(4, 8, le);
      view.setUint16(8, 1, le);
      view.setUint16(10, 0xb002, le);
      view.setUint16(12, 7, le);
      view.setUint32(14, 32, le);
      view.setUint32(18, 26, le);
      view.setUint32(26 + 4, primarySize, le);
      view.setUint32(26 + 16 + 4, gainMap.length, le);
      view.setUint32(26 + 16 + 8, gainOffset, le);
      return seg(0xe2, concat(latin1("MPF\0"), body));
    };
    const noise = seg(0xe1, concat(latin1("Exif\0\0"), tiff(1, false), new Uint8Array(300)));
    /** A primary image whose MPF points at the gain map right after it. */
    function hdrJpeg(le: boolean, marker: Uint8Array, gainOffset?: number): Uint8Array {
      // Two passes: sizes are fixed, only the offsets depend on them.
      let primary = jpegWith(noise, marker, mpfFor(le, 0, 0));
      const mpfStart = text(primary).indexOf("MPF\0") + 4;
      const offset = gainOffset ?? primary.length - mpfStart;
      primary = jpegWith(noise, marker, mpfFor(le, primary.length, offset));
      return concat(primary, gainMap);
    }
    it("requires re-encoding when HDR XMP also carries private data", () => {
      const mixed = seg(
        0xe1,
        latin1(
          'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="46,30N"/>',
        ),
      );
      expect(stripMetadata(hdrJpeg(false, mixed))).toBeNull();
    });

    it("requires re-encoding when an HDR secondary image carries private data", () => {
      const source = hdrJpeg(false, hdrXmp);
      const primary = source.slice(0, source.length - gainMap.length);
      const secondary = jpegWith(exif(1), seg(0xfe, latin1("GPSLatitude camera owner")));
      const base = text(primary).indexOf("MPF\0") + 4;
      new DataView(primary.buffer).setUint32(base + 26 + 16 + 4, secondary.length);
      expect(stripMetadata(concat(primary, secondary))).toBeNull();
    });

    it("requires re-encoding for an Ultra HDR JPEG", () => {
      expect(stripMetadata(hdrJpeg(false, hdrXmp))).toBeNull();
    });

    it("requires re-encoding for a little-endian MPF", () => {
      expect(stripMetadata(hdrJpeg(true, hdrXmp))).toBeNull();
    });

    it("requires re-encoding for an ISO 21496-1 JPEG", () => {
      expect(stripMetadata(hdrJpeg(false, isoGainMap))).toBeNull();
    });

    it("requires re-encoding even when an HDR MPF index is invalid", () => {
      for (const offset of [1 << 30, 8]) {
        expect(stripMetadata(hdrJpeg(false, hdrXmp, offset)), String(offset)).toBeNull();
      }
    });
  });

  it("reads no orientation from an entry that isn't one SHORT", () => {
    const block = tiff(6, false);
    new DataView(block.buffer).setUint16(12, 4);
    expect(orientationOf(jpegWith(seg(0xe1, concat(latin1("Exif\0\0"), block))))).toBe(1);
  });

  it("gives up on a JPEG it can't walk from SOI to EOI", () => {
    const file = jpegWith();
    // libjpeg skips stray bytes between segments with a warning; browsers show the image.
    const app0End = 4 + ((file[4] ?? 0) << 8) + (file[5] ?? 0);
    const cases = {
      "stray bytes": concat(
        file.subarray(0, app0End),
        Uint8Array.of(0x12, 0x34),
        file.subarray(app0End),
      ),
      "no EOI": file.subarray(0, file.length - 2),
      "cut in a segment": file.subarray(0, app0End + 10),
      "a second SOI": concat(jpegWith(Uint8Array.of(0xff, 0xd8))),
    };
    for (const [name, file] of Object.entries(cases)) {
      expect(stripMetadata(file), name).toBeNull();
    }
  });

  it("drops MPF and what follows EOI when nothing says HDR", () => {
    const mpf = seg(0xe2, concat(latin1("MPF\0MM\0*"), be32(8), be16(0)));
    const out = stripMetadata(concat(jpegWith(mpf), jpeg))?.bytes ?? new Uint8Array();
    expect(has(out, "MPF\0")).toBe(false);
    expect(out.length).toBe(jpeg.length);
  });
});

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const png = decode(photos.png);

function chunks(file: Uint8Array): { type: string; data: Uint8Array; crc: number }[] {
  const out = [];
  for (let at = 8; at + 12 <= file.length; ) {
    const view = new DataView(file.buffer, file.byteOffset + at);
    const length = view.getUint32(0);
    out.push({
      type: text(file.subarray(at + 4, at + 8)),
      data: file.subarray(at + 8, at + 8 + length),
      crc: view.getUint32(8 + length),
    });
    at += 12 + length;
  }
  return out;
}

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
const chunk = (type: string, data: Uint8Array) =>
  concat(be32(data.length), latin1(type), data, be32(crc32(concat(latin1(type), data))));

/** The PNG with chunks put right after IHDR, and `tail` before IEND. */
function pngWith(extra: Uint8Array[], tail: Uint8Array[] = []): Uint8Array {
  const ihdrEnd = 8 + 25;
  const iend = png.length - 12;
  return concat(
    png.subarray(0, ihdrEnd),
    ...extra,
    png.subarray(ihdrEnd, iend),
    ...tail,
    png.subarray(iend),
  );
}

/** Chromium splits its image data over several IDAT chunks. */
const IDATS = chunks(png)
  .filter((c) => c.type === "IDAT")
  .map((c) => c.type);

describe("PNG", () => {
  it("keeps image and colour chunks, and drops text and EXIF", () => {
    const source = pngWith(
      [
        chunk("tEXt", latin1("Comment\0made on a phone")),
        chunk("tRNS", Uint8Array.of(0, 0)),
        chunk("gAMA", be32(45455)),
        chunk("iCCP", latin1("icc\0\0profile")),
        chunk("cICP", Uint8Array.of(9, 16, 0, 1)),
      ],
      [chunk("eXIf", tiff(6, true)), chunk("iTXt", latin1("XML:com.adobe.xmp\0\0\0\0\0<x/>"))],
    );
    const out = stripMetadata(source)?.bytes ?? new Uint8Array();
    const types = chunks(out).map((c) => c.type);
    expect(types).toEqual(["IHDR", "tRNS", "gAMA", "iCCP", "cICP", ...IDATS, "IEND"]);
    for (const c of chunks(out)) expect(c.crc).toBe(crc32(concat(latin1(c.type), c.data)));
    const idat = (file: Uint8Array) =>
      chunks(file)
        .filter((c) => c.type === "IDAT")
        .map((c) => c.data);
    expect(idat(out)).toEqual(idat(png));
    expect(orientationOf(source)).toBe(6);
  });

  it("reads an orientation behind an Exif prefix", () => {
    const source = pngWith([], [chunk("eXIf", concat(latin1("Exif\0\0"), tiff(3, false)))]);
    expect(orientationOf(source)).toBe(3);
  });

  it("keeps every APNG frame", () => {
    const source = pngWith(
      [chunk("acTL", concat(be32(2), be32(0))), chunk("fcTL", new Uint8Array(26))],
      [chunk("fcTL", new Uint8Array(26)), chunk("fdAT", concat(be32(2), latin1("frame")))],
    );
    const types = chunks(stripMetadata(source)?.bytes ?? new Uint8Array()).map((c) => c.type);
    expect(types).toEqual(["IHDR", "acTL", "fcTL", ...IDATS, "fcTL", "fdAT", "IEND"]);
  });
});

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

const webp = decode(photos.webp);

function riffChunks(file: Uint8Array): { type: string; data: Uint8Array }[] {
  const out = [];
  for (let at = 12; at + 8 <= file.length; ) {
    const length = new DataView(file.buffer, file.byteOffset + at + 4).getUint32(0, true);
    out.push({
      type: text(file.subarray(at, at + 4)),
      data: file.subarray(at + 8, at + 8 + length),
    });
    at += 8 + length + (length % 2);
  }
  return out;
}
const riff = (type: string, data: Uint8Array) =>
  concat(
    latin1(type),
    le32(data.length),
    data,
    data.length % 2 ? Uint8Array.of(0) : new Uint8Array(),
  );
function webpOf(parts: Uint8Array[], flags: number): Uint8Array {
  const vp8x = riffChunks(webp)[0]?.data.slice() ?? new Uint8Array(10);
  vp8x[0] = flags;
  const body = concat(riff("VP8X", vp8x), ...parts);
  return concat(latin1("RIFF"), le32(body.length + 4), latin1("WEBP"), body);
}

describe("WebP", () => {
  const image = riffChunks(webp).filter((c) => c.type !== "VP8X");

  it.each(["VP8 ", "VP8L"])("cleans a simple %s file without VP8X", (type) => {
    const pixels = riff(type, latin1("image data"));
    const body = concat(
      pixels,
      riff("EXIF", concat(latin1("Exif\0\0"), tiff(1, false))),
      riff("XMP ", latin1("GPSLatitude")),
      riff("note", latin1("camera owner")),
    );
    const source = concat(latin1("RIFF"), le32(body.length + 4), latin1("WEBP"), body);
    const out = stripMetadata(source)?.bytes ?? new Uint8Array();
    const expected = concat(latin1("RIFF"), le32(pixels.length + 4), latin1("WEBP"), pixels);
    expect(out).toEqual(expected);
  });

  it.each(["VP8 ", "VP8L"])("drops bytes beyond a simple %s file's RIFF size", (type) => {
    const pixels = riff(type, latin1("image data"));
    const source = concat(latin1("RIFF"), le32(pixels.length + 4), latin1("WEBP"), pixels);
    const out = stripMetadata(concat(source, latin1("GPSLatitude camera owner")))?.bytes;
    expect(out).toEqual(source);
  });

  it("drops EXIF and XMP, and sets the flags to match", () => {
    const source = webpOf(
      [
        ...image.map((c) => riff(c.type, c.data)),
        riff("EXIF", concat(latin1("Exif\0\0"), tiff(6, false))),
        riff("XMP ", latin1("<x:xmpmeta>GPS</x:xmpmeta>")),
      ],
      0x20 | 0x08 | 0x04,
    );
    const out = stripMetadata(source)?.bytes ?? new Uint8Array();
    const kept = riffChunks(out);
    expect(kept.map((c) => c.type)).toEqual(["VP8X", ...image.map((c) => c.type)]);
    expect((kept[0]?.data[0] ?? 0) & 0x2c).toBe(0x20);
    expect(orientationOf(source)).toBe(6);
    expect(new DataView(out.buffer, out.byteOffset).getUint32(4, true)).toBe(out.length - 8);
    for (const c of image) {
      expect(kept.find((k) => k.type === c.type)?.data).toEqual(c.data);
    }
  });

  it("reads an orientation without an Exif prefix", () => {
    const source = webpOf(
      [...image.map((c) => riff(c.type, c.data)), riff("EXIF", tiff(8, true))],
      0x08,
    );
    expect(orientationOf(source)).toBe(8);
  });

  it("keeps an animation's chunks, and the A flag", () => {
    const source = webpOf(
      [
        riff("ANIM", new Uint8Array(6)),
        riff("ANMF", latin1("frame one")),
        riff("ANMF", latin1("frame 2")),
      ],
      0x02,
    );
    const kept = riffChunks(stripMetadata(source)?.bytes ?? new Uint8Array());
    expect(kept.map((c) => c.type)).toEqual(["VP8X", "ANIM", "ANMF", "ANMF"]);
    expect((kept[0]?.data[0] ?? 0) & 0x02).toBe(0x02);
  });

  it("clears the I flag without ICCP", () => {
    const source = webpOf(
      image.filter((c) => c.type !== "ICCP").map((c) => riff(c.type, c.data)),
      0x20,
    );
    const kept = riffChunks(stripMetadata(source)?.bytes ?? new Uint8Array());
    expect((kept[0]?.data[0] ?? 0) & 0x20).toBe(0);
  });

  it("pads an odd chunk the file cut before its padding byte", () => {
    const whole = webpOf([riff("ANIM", new Uint8Array(6)), riff("ANMF", latin1("odd"))], 0x02);
    const cut = whole.subarray(0, whole.length - 1);
    const out = stripMetadata(cut)?.bytes ?? new Uint8Array();
    expect(out.length % 2).toBe(0);
    expect(riffChunks(out).at(-1)?.data).toEqual(latin1("odd"));
  });

  it("ignores what follows the RIFF", () => {
    const source = webpOf([riff("ANIM", new Uint8Array(6))], 0x02);
    const out = stripMetadata(concat(source, riff("ANMF", latin1("GPS!"))))?.bytes;
    expect(out).toEqual(source);
  });
});

// ---------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------

describe("GIF", () => {
  const header = concat(latin1("GIF89a"), Uint8Array.of(1, 0, 1, 0, 0x80, 0, 0), new Uint8Array(6));
  const loop = concat(
    Uint8Array.of(0x21, 0xff, 11),
    latin1("NETSCAPE2.0"),
    Uint8Array.of(3, 1, 0, 0, 0),
  );
  const gce = Uint8Array.of(0x21, 0xf9, 4, 0, 10, 0, 0, 0);
  const frame = Uint8Array.of(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0);
  const comment = concat(Uint8Array.of(0x21, 0xfe, 9), latin1("a comment"), Uint8Array.of(0));
  const xmp = concat(
    Uint8Array.of(0x21, 0xff, 11),
    latin1("XMP DataXMP"),
    Uint8Array.of(3),
    latin1("GPS"),
    Uint8Array.of(0),
  );

  it("keeps every frame, their timing and the loop, and drops comments and XMP", () => {
    const source = concat(header, loop, comment, gce, frame, xmp, gce, frame, Uint8Array.of(0x3b));
    const out = stripMetadata(source)?.bytes ?? new Uint8Array();
    expect(out).toEqual(concat(header, loop, gce, frame, gce, frame, Uint8Array.of(0x3b)));
  });

  it("keeps a frame's local colour table", () => {
    const local = concat(
      Uint8Array.of(0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x80),
      Uint8Array.of(255, 0, 0, 0, 0, 255),
      Uint8Array.of(2, 2, 0x44, 0x01, 0),
    );
    const source = concat(header, gce, local, Uint8Array.of(0x3b));
    expect(stripMetadata(source)?.bytes).toEqual(source);
  });

  it("gives up on a GIF cut inside a block or its colour table", () => {
    const whole = concat(header, gce, frame, Uint8Array.of(0x3b));
    expect(stripMetadata(whole.subarray(0, whole.length - 3))).toBeNull();
    expect(stripMetadata(header.subarray(0, 15))).toBeNull();
  });

  it("drops a plain text block with its control, and ends with the trailer", () => {
    const text = Uint8Array.of(0x21, 0x01, 12, ...new Uint8Array(12), 2, 0x41, 0x42, 0);
    const slow = Uint8Array.of(0x21, 0xf9, 4, 0, 200, 0, 0, 0);
    const out = stripMetadata(concat(header, slow, text, gce, frame))?.bytes;
    expect(out).toEqual(concat(header, gce, frame, Uint8Array.of(0x3b)));
  });
});

describe("formatOf", () => {
  it("knows the four formats and nothing else", () => {
    expect(formatOf(jpeg)).toBe("jpeg");
    expect(formatOf(png)).toBe("png");
    expect(formatOf(webp)).toBe("webp");
    expect(formatOf(latin1("GIF89a"))).toBe("gif");
    expect(formatOf(latin1("BM...."))).toBeNull();
    expect(stripMetadata(latin1("\0\0\0\x1cftypavif"))).toBeNull();
  });
});
