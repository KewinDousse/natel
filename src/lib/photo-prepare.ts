/**
 * Turns a chosen file into the photo a card stores (ADR 023). An uncropped
 * JPEG, PNG, GIF or WebP that is already small keeps its image data byte for
 * byte, only its hidden metadata filtered. Anything else (a crop, a large
 * photo, a rotated one, a format not every client reads) is drawn on a
 * canvas, scaled down to MAX_SIDE, and encoded as a JPEG, or a PNG when it
 * has transparency or comes out smaller. Every way a browser can fail
 * silently there is checked, so a blank image never replaces the user's
 * photo.
 */

import type { Rect, Size } from "./photo-crop";
import { formatOf, orientationOf, type StrippedImage, stripMetadata } from "./photo-metadata";

export type PreparedPhoto = {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  base64: string;
};

/**
 * Why a photo can't be used: the file doesn't decode, or the canvas gave
 * back nothing usable.
 */
export class PhotoError extends Error {
  constructor(
    public readonly code: "UNDECODABLE" | "ENCODE_FAILED",
    cause?: unknown,
  ) {
    super(`Photo: ${code}`, { cause });
    this.name = "PhotoError";
  }
}

/**
 * Longest side of a stored photo. Past what any client shows a contact
 * photo at (Android keeps 720 px), with room for a sharp avatar on a
 * high-density screen.
 */
export const MAX_SIDE = 1024;

/** Past this, a photo is re-encoded even when it fits MAX_SIDE. */
export const MAX_KEPT_BYTES = 512 * 1024;

/** High enough that the loss doesn't show at avatar sizes, a third of quality 1's weight. */
const JPEG_QUALITY = 0.9;

/** Formats a flat graphic comes in, worth trying as a PNG. */
const PNG_SOURCES = new Set<string | null>(["png", "gif", "webp"]);

/** iOS Safari's canvas cap: no intermediate canvas goes past it. */
const MAX_CANVAS_PIXELS = 16_777_216;

/** The image with its EXIF orientation applied. */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    // Engines that reject this option value still orient by default.
    if (!(err instanceof TypeError || err instanceof RangeError)) {
      throw new PhotoError("UNDECODABLE", err);
    }
  }
  try {
    return await createImageBitmap(file);
  } catch (err) {
    throw new PhotoError("UNDECODABLE", err);
  }
}

export function bitmapSize(bitmap: ImageBitmap): Size {
  return { width: bitmap.width, height: bitmap.height };
}

/**
 * The photo to store. `crop` is null when the frame ended as it opened: a
 * small enough file is then kept whole when its format allows.
 */
export async function preparePhoto(
  bytes: Uint8Array,
  bitmap: ImageBitmap,
  crop: Rect | null,
): Promise<PreparedPhoto> {
  const whole = crop === null ? keptWhole(bytes, bitmap) : null;
  if (whole) return { mediaType: `image/${whole.format}`, base64: toBase64(whole.bytes) };
  const area = crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const size = scaledSize(area, MAX_SIDE);
  const canvas = drawScaled(bitmap, area, size);
  try {
    const format = formatOf(bytes);
    const { blob, type } = await encode(canvas, format !== "jpeg", PNG_SOURCES.has(format));
    await checkEncoded(blob, bitmap, area, size);
    return { mediaType: type, base64: toBase64(new Uint8Array(await blob.arrayBuffer())) };
  } finally {
    release(canvas);
  }
}

/**
 * The file without its hidden metadata, when it is small enough to keep as it
 * is and shows upright without its EXIF orientation, which Android ignores.
 */
export function keptWhole(bytes: Uint8Array, image: Size): StrippedImage | null {
  if (Math.max(image.width, image.height) > MAX_SIDE || orientationOf(bytes) !== 1) return null;
  const stripped = stripMetadata(bytes);
  return stripped && stripped.bytes.length <= MAX_KEPT_BYTES ? stripped : null;
}

/** The area's size, scaled down so its longest side is at most `max`. */
export function scaledSize(area: Size, max: number): Size {
  const scale = Math.min(1, max / Math.max(area.width, area.height));
  return {
    width: Math.max(1, Math.round(area.width * scale)),
    height: Math.max(1, Math.round(area.height * scale)),
  };
}

/**
 * The sizes to draw through, halving from the area towards the target, then
 * the target. One large step aliases in browsers whose smoothing reads only
 * a few source pixels per output pixel; no step goes past the canvas cap.
 */
export function scaleSteps(area: Size, target: Size): Size[] {
  const steps: Size[] = [];
  let { width, height } = area;
  while (width / 2 >= target.width && height / 2 >= target.height) {
    width = Math.round(width / 2);
    height = Math.round(height / 2);
    if (width * height <= MAX_CANVAS_PIXELS) steps.push({ width, height });
  }
  const last = steps.at(-1);
  if (last?.width !== target.width || last?.height !== target.height) steps.push(target);
  return steps;
}

function canvasOf(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  // Display-P3 keeps a wide-gamut photo's colours where the browser has it;
  // others ignore the option and draw in sRGB.
  const context = canvas.getContext("2d", { colorSpace: "display-p3" });
  if (context === null) throw new PhotoError("ENCODE_FAILED");
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

/** iOS Safari counts canvas memory until GC: free a canvas as soon as it's done. */
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function drawScaled(image: CanvasImageSource, area: Rect, size: Size): HTMLCanvasElement {
  let source: CanvasImageSource = image;
  let from: Rect = area;
  let canvas: HTMLCanvasElement | null = null;
  for (const step of scaleSteps(area, size)) {
    const next = canvasOf(step.width, step.height);
    next.context.drawImage(
      source,
      from.x,
      from.y,
      from.width,
      from.height,
      0,
      0,
      step.width,
      step.height,
    );
    if (canvas) release(canvas);
    canvas = next.canvas;
    source = canvas;
    from = { x: 0, y: 0, ...step };
  }
  if (canvas === null) throw new PhotoError("ENCODE_FAILED");
  return canvas;
}

/**
 * A JPEG, unless the image has transparency and its PNG fits
 * MAX_KEPT_BYTES; past that, it is flattened on white, since a card that
 * size is what servers refuse. A source that may be a flat graphic also
 * tries PNG, and keeps the lighter.
 */
async function encode(
  canvas: HTMLCanvasElement,
  mayBeTransparent: boolean,
  mayBeGraphic: boolean,
): Promise<{ blob: Blob; type: "image/jpeg" | "image/png" }> {
  if (mayBeTransparent && hasTransparency(canvas)) {
    const png = await toBlob(canvas, "image/png");
    if (png.size <= MAX_KEPT_BYTES) return { blob: png, type: "image/png" };
    const flat = onWhite(canvas);
    try {
      return { blob: await toBlob(flat, "image/jpeg", JPEG_QUALITY), type: "image/jpeg" };
    } finally {
      release(flat);
    }
  }
  const jpeg = await toBlob(canvas, "image/jpeg", JPEG_QUALITY);
  if (!mayBeGraphic) return { blob: jpeg, type: "image/jpeg" };
  const png = await toBlob(canvas, "image/png");
  return png.size < jpeg.size
    ? { blob: png, type: "image/png" }
    : { blob: jpeg, type: "image/jpeg" };
}

function onWhite(image: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, context } = canvasOf(image.width, image.height);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, image.width, image.height);
  context.drawImage(image, 0, 0);
  return canvas;
}

async function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // A browser that can't encode the type hands back a PNG instead.
  if (blob === null || blob.type !== type) throw new PhotoError("ENCODE_FAILED");
  return blob;
}

function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d");
  if (context === null) throw new PhotoError("ENCODE_FAILED");
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
}

/** Side of the thumbnails the encoded image is compared on. */
const SAMPLE = 8;
/** Per channel, well past JPEG's loss at JPEG_QUALITY, well short of a blank image. */
const TOLERANCE = 48;

/** The encoded image decodes back to the expected size and looks like the source. */
async function checkEncoded(
  blob: Blob,
  source: ImageBitmap,
  area: Rect,
  size: Size,
): Promise<void> {
  let decoded: ImageBitmap;
  try {
    decoded = await createImageBitmap(blob);
  } catch (err) {
    throw new PhotoError("ENCODE_FAILED", err);
  }
  try {
    if (decoded.width !== size.width || decoded.height !== size.height) {
      throw new PhotoError("ENCODE_FAILED");
    }
    const expected = sample(source, area);
    const actual = sample(decoded, { x: 0, y: 0, ...size });
    for (let i = 0; i < expected.length; i += 1) {
      if (Math.abs((expected[i] ?? 0) - (actual[i] ?? 0)) > TOLERANCE) {
        throw new PhotoError("ENCODE_FAILED");
      }
    }
  } finally {
    decoded.close();
  }
}

/**
 * The area drawn small, through the same halving as the photo, so the
 * source and its encoded copy alias alike. On white: a nearly transparent
 * pixel's colour swings widely with a level of alpha, and a JPEG result was
 * flattened anyway.
 */
function sample(image: ImageBitmap, area: Rect): Uint8ClampedArray {
  const small = drawScaled(image, area, { width: SAMPLE, height: SAMPLE });
  const thumbnail = onWhite(small);
  try {
    const context = thumbnail.getContext("2d");
    if (context === null) throw new PhotoError("ENCODE_FAILED");
    return context.getImageData(0, 0, SAMPLE, SAMPLE).data;
  } finally {
    release(small);
    release(thumbnail);
  }
}

/** Base64 of any size, in chunks small enough for `String.fromCharCode`. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let at = 0; at < bytes.length; at += chunk) {
    binary += String.fromCharCode(...bytes.subarray(at, at + chunk));
  }
  return btoa(binary);
}
