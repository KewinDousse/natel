/**
 * Turns a chosen file into the photo a card stores (ADR 023). An uncropped
 * JPEG, PNG, GIF or WebP keeps its image data byte for byte, only its hidden
 * metadata filtered; a crop, or any other format the browser decodes, is
 * drawn on a canvas at the source's resolution and encoded in the source's
 * family. Every way a browser can fail silently there is checked, so a blank
 * image never replaces the user's photo.
 */

import type { Rect, Size } from "./photo-crop";
import { formatOf, stripMetadata } from "./photo-metadata";

export type PreparedPhoto = {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  base64: string;
};

/**
 * Why a photo can't be used: the file doesn't decode, the area is past what
 * a canvas holds in every browser, or the canvas gave back nothing usable.
 */
export class PhotoError extends Error {
  constructor(
    public readonly code: "UNDECODABLE" | "TOO_LARGE_TO_CROP" | "ENCODE_FAILED",
    cause?: unknown,
  ) {
    super(`Photo: ${code}`, { cause });
    this.name = "PhotoError";
  }
}

/** iOS Safari's canvas cap, applied everywhere so the behaviour is the same. */
export const MAX_CANVAS_PIXELS = 16_777_216;

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
 * The photo to store. `crop` is null when the frame ended as it opened: the
 * whole file is then kept when its format allows.
 */
export async function preparePhoto(
  bytes: Uint8Array,
  bitmap: ImageBitmap,
  crop: Rect | null,
): Promise<PreparedPhoto> {
  if (crop === null) {
    const stripped = stripMetadata(bytes);
    if (stripped)
      return { mediaType: `image/${stripped.format}`, base64: toBase64(stripped.bytes) };
  }
  const area = crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const type = formatOf(bytes) === "jpeg" ? "image/jpeg" : "image/png";
  const blob = await drawOnCanvas(bitmap, area, type);
  await checkEncoded(blob, bitmap, area);
  return { mediaType: type, base64: toBase64(new Uint8Array(await blob.arrayBuffer())) };
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
  return { canvas, context };
}

async function drawOnCanvas(bitmap: ImageBitmap, area: Rect, type: string): Promise<Blob> {
  if (area.width * area.height > MAX_CANVAS_PIXELS) throw new PhotoError("TOO_LARGE_TO_CROP");
  const { canvas, context } = canvasOf(area.width, area.height);
  context.drawImage(bitmap, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 1));
  if (blob === null) throw new PhotoError("ENCODE_FAILED");
  return blob;
}

/** Side of the thumbnails the encoded image is compared on. */
const SAMPLE = 8;
/** Per channel, well past JPEG's loss at quality 1, well short of a blank image. */
const TOLERANCE = 48;

/** The encoded image decodes back to the expected size and looks like the source. */
async function checkEncoded(blob: Blob, source: ImageBitmap, area: Rect): Promise<void> {
  let decoded: ImageBitmap;
  try {
    decoded = await createImageBitmap(blob);
  } catch (err) {
    throw new PhotoError("ENCODE_FAILED", err);
  }
  try {
    if (decoded.width !== area.width || decoded.height !== area.height) {
      throw new PhotoError("ENCODE_FAILED");
    }
    const expected = sample(source, area);
    const actual = sample(decoded, { x: 0, y: 0, width: area.width, height: area.height });
    for (let i = 0; i < expected.length; i += 1) {
      if (Math.abs((expected[i] ?? 0) - (actual[i] ?? 0)) > TOLERANCE) {
        throw new PhotoError("ENCODE_FAILED");
      }
    }
  } finally {
    decoded.close();
  }
}

function sample(image: ImageBitmap, area: Rect): Uint8ClampedArray {
  const { context } = canvasOf(SAMPLE, SAMPLE);
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, SAMPLE, SAMPLE);
  return context.getImageData(0, 0, SAMPLE, SAMPLE).data;
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
