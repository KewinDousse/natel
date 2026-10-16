/**
 * PHOTO (ADR 023): read for display, its image format recognised, and a
 * replaced one written as the card's version expects.
 */

import ICAL from "ical.js";
import type { Contact, PhotoEdit, RawComponent, RawProperty } from "../model/contact";
import { versionOf } from "./fields";

/** A photo as the page shows it: base64 image data and its media type. */
export type Photo = { mediaType: string; base64: string };

/** `TYPE` values naming an image format, as 3.0 cards write them. */
const IMAGE_TYPES: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
};

/** The image format its first bytes announce, null for anything else. */
export function sniffImageType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "image/png";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 2) === "BM") return "image/bmp";
  if (ascii(0, 4) === "II*\0" || ascii(0, 4) === "MM\0*") return "image/tiff";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (brand === "mif1" || brand === "msf1") return "image/heif";
  }
  return null;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** The first bytes of base64 data, enough to sniff; null if it isn't base64. */
function headOf(base64: string): Uint8Array | null {
  if (!BASE64.test(base64)) return null;
  try {
    const head = atob(base64.slice(0, 24));
    return Uint8Array.from(head, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function paramOf(prop: RawProperty, name: string): string {
  const value = (prop.toJSON() as [string, Record<string, unknown>])[1]?.[name];
  return String(Array.isArray(value) ? value[0] : (value ?? "")).trim();
}

/**
 * The photo to show (ADR 023): the first `PHOTO`, whatever the card's
 * version, that is base64 image data, from an `ENCODING` of `b` or `base64`
 * (typed by `TYPE`, else by its bytes) or a base64 `data:image/` URI. A URL
 * is never fetched; null when no `PHOTO` qualifies.
 */
export function photoOf(contact: Contact): Photo | null {
  for (const prop of contact.raw.getAllProperties("photo")) {
    const raw = prop.getFirstValue();
    const text = String(
      raw !== null && typeof raw === "object" && "value" in raw
        ? (raw as { value: unknown }).value
        : (raw ?? ""),
    );
    // A photo can weigh several MB: copy it only when there is space to drop.
    const value = /\s/.test(text) ? text.replace(/\s+/g, "") : text;
    const encoding = paramOf(prop, "encoding").toLowerCase();
    if (encoding === "b" || encoding === "base64") {
      const head = headOf(value);
      if (!head) continue;
      const declared = paramOf(prop, "type").toLowerCase();
      const mediaType =
        IMAGE_TYPES[declared] ??
        (/^image\/[\w.+-]+$/.test(declared) ? declared : null) ??
        sniffImageType(head);
      if (mediaType) return { mediaType, base64: value };
      continue;
    }
    // Some servers store the URI escaped as text (`data:image/jpeg\;base64\,…`).
    const uri = /^data:(image\/[\w.+-]+)(?:;[^,;]*)*;base64,(.*)$/i.exec(
      value.replace(/\\([\\,;])/g, "$1"),
    );
    if (uri?.[1] && uri[2] && headOf(uri[2])) {
      return { mediaType: uri[1].toLowerCase(), base64: uri[2] };
    }
  }
  return null;
}

/**
 * Whether "Changer la photo" can write this card: a 3.0 or 4.0 one (ADR 023).
 * 2.1 encodes photos its own way, and a card without a version has none.
 */
export function canReplacePhoto(contact: Contact): boolean {
  return versionOf(contact.raw) !== null;
}

/** The 3.0 `TYPE` for each format a new photo can have. */
const PHOTO_TYPES: Record<Extract<PhotoEdit, { kind: "replaced" }>["mediaType"], string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/gif": "GIF",
  "image/webp": "WEBP",
};

/**
 * Replaces every `PHOTO` with the new one, carrying only `ENCODING` and
 * `TYPE` on a 3.0 card, or a data URI with no parameter on a 4.0 one, which
 * ical.js writes with its comma escaped; or removes them all (ADR 023). An
 * unchanged photo is left alone.
 */
export function updatePhotoProperty(raw: RawComponent, photo: PhotoEdit): void {
  if (photo.kind === "unchanged") return;
  const version = versionOf(raw);
  if (photo.kind === "replaced" && version === null) {
    throw new Error("A new photo is written on a vCard 3.0 or 4.0 card only (ADR 023)");
  }
  raw.removeAllProperties("photo");
  if (photo.kind === "removed") return;
  const prop = new ICAL.Property("photo");
  if (version === "4.0") {
    prop.resetType("uri");
    prop.setValue(`data:${photo.mediaType};base64,${photo.base64}`);
  } else {
    prop.resetType("binary");
    prop.setParameter("encoding", "b");
    prop.setParameter("type", PHOTO_TYPES[photo.mediaType]);
    prop.setValue(photo.base64);
  }
  raw.addProperty(prop);
}
