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
import { preparePhoto, toBase64 } from "@/lib/photo-prepare";
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

describe("preparePhoto with a crop", () => {
  it("refuses an area past the canvas cap before drawing anything", async () => {
    const bytes = Uint8Array.from(atob(photos.jpeg), (c) => c.charCodeAt(0));
    const bitmap = { width: 5000, height: 5000 } as ImageBitmap;
    const area = { x: 0, y: 0, width: 5000, height: 5000 };
    await expect(preparePhoto(bytes, bitmap, area)).rejects.toMatchObject({
      code: "TOO_LARGE_TO_CROP",
    });
  });
});

describe("toBase64", () => {
  it("encodes past the argument limit of String.fromCharCode", () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(atob(toBase64(bytes)).length).toBe(bytes.length);
    expect(toBase64(Uint8Array.of(1, 2, 3))).toBe("AQID");
  });
});
