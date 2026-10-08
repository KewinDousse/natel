/**
 * Tests for the crop frame's geometry and the uncropped path of
 * src/lib/photo-prepare.ts (ADR 023). The canvas path runs in Chromium, in
 * tests/e2e/photo-edit.spec.ts.
 */
import { describe, expect, it } from "vitest";
import {
  cropRect,
  initialCrop,
  isUnchanged,
  MAX_ZOOM,
  pan,
  scaleOf,
  zoomTo,
} from "@/lib/photo-crop";
import { stripMetadata } from "@/lib/photo-metadata";
import {
  keptWhole,
  MAX_KEPT_BYTES,
  MAX_SIDE,
  preparePhoto,
  scaledSize,
  scaleSteps,
  toBase64,
} from "@/lib/photo-prepare";
import photos from "../vcard/photo-bytes.json";

const landscape = { width: 800, height: 600 };

describe("crop frame", () => {
  it("opens at 1×, centred, on the image's centred square", () => {
    const state = initialCrop(landscape);
    expect(cropRect(landscape, state)).toEqual({ x: 100, y: 0, width: 600, height: 600 });
    expect(isUnchanged(landscape, state)).toBe(true);
  });

  it("zooms between 1× and 4× around the frame's centre", () => {
    const state = zoomTo(landscape, initialCrop(landscape), 2);
    expect(cropRect(landscape, state)).toEqual({ x: 250, y: 150, width: 300, height: 300 });
    expect(zoomTo(landscape, state, 10).zoom).toBe(MAX_ZOOM);
    expect(zoomTo(landscape, state, 0.2).zoom).toBe(1);
  });

  it("pans by screen pixels, scaled to the image, and never past its edges", () => {
    const frame = 300;
    const start = initialCrop(landscape);
    expect(scaleOf(landscape, start, frame)).toBe(0.5);
    // A drag of 25 screen px to the right shows 50 image px further left.
    expect(cropRect(landscape, pan(landscape, start, 25, 0, frame)).x).toBe(50);
    expect(cropRect(landscape, pan(landscape, start, 1000, 1000, frame))).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 600,
    });
  });

  it("counts a frame moved and brought back as unchanged", () => {
    const frame = 300;
    const moved = pan(landscape, initialCrop(landscape), 40, 0, frame);
    expect(isUnchanged(landscape, moved)).toBe(false);
    expect(isUnchanged(landscape, pan(landscape, moved, -40, 0, frame))).toBe(true);
    const zoomed = zoomTo(landscape, initialCrop(landscape), 1.5);
    expect(isUnchanged(landscape, zoomTo(landscape, zoomed, 1))).toBe(true);
  });
});

describe("preparePhoto without a crop", () => {
  it("keeps a JPEG, PNG or WebP whole, with only the kept metadata", async () => {
    for (const [format, base64] of [
      ["jpeg", photos.jpeg],
      ["png", photos.png],
      ["webp", photos.webp],
    ] as const) {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = { width: 8, height: 6 } as ImageBitmap;
      const photo = await preparePhoto(bytes, bitmap, null);
      expect(photo.mediaType).toBe(`image/${format}`);
      expect(photo.base64).toBe(toBase64(stripMetadata(bytes)?.bytes ?? new Uint8Array()));
    }
  });
});

describe("scaledSize", () => {
  it("brings the longest side down to the limit, keeping the ratio", () => {
    expect(scaledSize({ width: 4000, height: 3000 }, 1024)).toEqual({ width: 1024, height: 768 });
    expect(scaledSize({ width: 1200, height: 4800 }, 1024)).toEqual({ width: 256, height: 1024 });
  });

  it("never scales up", () => {
    expect(scaledSize({ width: 300, height: 200 }, 1024)).toEqual({ width: 300, height: 200 });
  });
});

describe("scaleSteps", () => {
  it("halves until the next half would pass the target, then lands on it", () => {
    expect(scaleSteps({ width: 4000, height: 3000 }, { width: 1024, height: 768 })).toEqual([
      { width: 2000, height: 1500 },
      { width: 1024, height: 768 },
    ]);
  });

  it("draws once when the area is already within twice the target", () => {
    expect(scaleSteps({ width: 1500, height: 1500 }, { width: 1024, height: 1024 })).toEqual([
      { width: 1024, height: 1024 },
    ]);
    expect(scaleSteps({ width: 300, height: 200 }, { width: 300, height: 200 })).toEqual([
      { width: 300, height: 200 },
    ]);
  });

  it("skips a half past iOS Safari's canvas cap, and never undershoots the target", () => {
    const target = { width: 1024, height: 768 };
    const steps = scaleSteps({ width: 12000, height: 9000 }, target);
    expect(steps[0]).toEqual({ width: 3000, height: 2250 });
    expect(steps.at(-1)).toEqual(target);
    for (const step of steps) {
      expect(step.width * step.height).toBeLessThanOrEqual(16_777_216);
      expect(step.width).toBeGreaterThanOrEqual(target.width);
      expect(step.height).toBeGreaterThanOrEqual(target.height);
    }
  });
});

describe("keptWhole", () => {
  const bytes = Uint8Array.from(atob(photos.png), (c) => c.charCodeAt(0));

  it("keeps a file within MAX_SIDE and MAX_KEPT_BYTES", () => {
    expect(keptWhole(bytes, { width: MAX_SIDE, height: 6 })?.format).toBe("png");
  });

  it("re-encodes an image past MAX_SIDE", () => {
    expect(keptWhole(bytes, { width: MAX_SIDE + 1, height: 6 })).toBeNull();
  });

  it("re-encodes a file whose kept data is past MAX_KEPT_BYTES", () => {
    // A PNG ancillary chunk the filter keeps (sBIT), padded past the limit.
    const iend = bytes.length - 12;
    const data = new Uint8Array(MAX_KEPT_BYTES);
    const chunk = new Uint8Array(12 + data.length);
    new DataView(chunk.buffer).setUint32(0, data.length);
    chunk.set([0x73, 0x42, 0x49, 0x54], 4);
    const large = new Uint8Array([...bytes.subarray(0, iend), ...chunk, ...bytes.subarray(iend)]);
    expect(stripMetadata(large)?.bytes.length).toBeGreaterThan(MAX_KEPT_BYTES);
    expect(keptWhole(large, { width: 8, height: 6 })).toBeNull();
  });

  it("re-encodes a file with an EXIF orientation, which Android ignores", () => {
    // IHDR, then an eXIf chunk whose TIFF block says orientation 6.
    const tiff = new Uint8Array(26);
    const view = new DataView(tiff.buffer);
    tiff.set([0x4d, 0x4d]); // "MM", big-endian
    view.setUint16(2, 42);
    view.setUint32(4, 8); // IFD0
    view.setUint16(8, 1); // one entry:
    view.setUint16(10, 0x0112); // orientation,
    view.setUint16(12, 3); // a SHORT,
    view.setUint32(14, 1); // count 1,
    view.setUint16(18, 6); // value 6
    const chunk = new Uint8Array(12 + tiff.length);
    new DataView(chunk.buffer).setUint32(0, tiff.length);
    chunk.set([0x65, 0x58, 0x49, 0x66], 4);
    chunk.set(tiff, 8);
    const rotated = new Uint8Array([...bytes.subarray(0, 33), ...chunk, ...bytes.subarray(33)]);
    expect(keptWhole(rotated, { width: 8, height: 6 })).toBeNull();
  });
});

describe("toBase64", () => {
  it("encodes past the argument limit of String.fromCharCode", () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(atob(toBase64(bytes)).length).toBe(bytes.length);
    expect(toBase64(Uint8Array.of(1, 2, 3))).toBe("AQID");
  });
});
