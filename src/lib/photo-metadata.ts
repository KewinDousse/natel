/**
 * Strips from an image file what doesn't change how it shows (ADR 023), by
 * copying its segments or chunks verbatim, in order: the image data is never
 * re-encoded. Each format keeps an allowlist; everything else (GPS, camera,
 * dates, thumbnails, comments, XMP) goes, the EXIF block included: a photo
 * whose orientation matters goes through the canvas instead (`orientationOf`).
 * No dependency.
 */

export type ImageFormat = "jpeg" | "png" | "gif" | "webp";

export type StrippedImage = { format: ImageFormat; bytes: Uint8Array };

/**
 * The file without its hidden metadata, or null when it isn't a JPEG, PNG,
 * GIF or WebP, or is a JPEG or GIF this can't walk to its end: copying only
 * the blocks read before the fault would lose the image.
 */
export function stripMetadata(file: Uint8Array): StrippedImage | null {
  const format = formatOf(file);
  if (format === null) return null;
  const strip = { jpeg: stripJpeg, png: stripPng, gif: stripGif, webp: stripWebp }[format];
  const bytes = strip(file);
  return bytes === null ? null : { format, bytes };
}

/**
 * The EXIF orientation a JPEG, PNG or WebP carries, 1 when it has none or
 * isn't one of those. Android ignores it, so a file with another one can't
 * be kept as it is.
 */
export function orientationOf(file: Uint8Array): number {
  const format = formatOf(file);
  if (format === "jpeg") {
    const exif = jpegSegments(file)?.find(
      (s) => s.marker === 0xe1 && ascii(s.payload, 0, EXIF_ID.length) === EXIF_ID,
    );
    return exif ? readOrientation(exif.payload.subarray(EXIF_ID.length)) : 1;
  }
  const exif =
    format === "png"
      ? pngChunks(file).find((c) => c.type === "eXIf")
      : format === "webp"
        ? webpChunks(file).find((c) => c.type === "EXIF")
        : undefined;
  return exif ? chunkOrientation(exif.data) : 1;
}

export function formatOf(file: Uint8Array): ImageFormat | null {
  if (file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return "jpeg";
  if (ascii(file, 0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (ascii(file, 0, 6) === "GIF87a" || ascii(file, 0, 6) === "GIF89a") return "gif";
  if (ascii(file, 0, 4) === "RIFF" && ascii(file, 8, 12) === "WEBP") return "webp";
  return null;
}

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, Math.min(to, bytes.length)));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const u16be = (b: Uint8Array, at: number) => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u32be = (b: Uint8Array, at: number) => ((u16be(b, at) << 16) | u16be(b, at + 2)) >>> 0;
const u32le = (b: Uint8Array, at: number) =>
  ((b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16) | ((b[at + 3] ?? 0) << 24)) >>>
  0;

function be16(value: number): Uint8Array {
  return Uint8Array.of((value >> 8) & 0xff, value & 0xff);
}
function le32(value: number): Uint8Array {
  return Uint8Array.of(
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}
const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

// ---------------------------------------------------------------------------
// EXIF orientation
// ---------------------------------------------------------------------------

const EXIF_ID = "Exif\0\0";

/** The orientation in a TIFF block (EXIF without its `Exif\0\0` prefix); 1 when absent. */
function readOrientation(tiff: Uint8Array): number {
  const order = ascii(tiff, 0, 2);
  if (order !== "II" && order !== "MM") return 1;
  const le = order === "II";
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  try {
    const ifd = view.getUint32(4, le);
    const count = view.getUint16(ifd, le);
    for (let i = 0; i < count; i += 1) {
      const entry = ifd + 2 + i * 12;
      if (view.getUint16(entry, le) !== 0x0112) continue;
      const isShort = view.getUint16(entry + 2, le) === 3 && view.getUint32(entry + 4, le) === 1;
      const value = isShort ? view.getUint16(entry + 8, le) : 1;
      // Only 2 to 8 turn or flip the image; any other value shows it as stored.
      return value >= 2 && value <= 8 ? value : 1;
    }
  } catch {
    return 1;
  }
  return 1;
}

/** The orientation in a PNG `eXIf` or WebP `EXIF` chunk, which some writers prefix with `Exif\0\0`. */
const chunkOrientation = (data: Uint8Array) =>
  readOrientation(
    ascii(data, 0, EXIF_ID.length) === EXIF_ID ? data.subarray(EXIF_ID.length) : data,
  );

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

const XMP_ID = "http://ns.adobe.com/xap/1.0/\0";
const HDRGM = "http://ns.adobe.com/hdr-gain-map/1.0/";
const ISO_GAIN_MAP = "urn:iso:std:iso:ts:21496:-1";

type Segment = { marker: number; start: number; end: number; payload: Uint8Array };

/**
 * The file's segments after SOI through EOI, each scan with its entropy-coded
 * data; null when anything but a marker comes between them, a segment runs
 * past the end, or there is no EOI.
 */
function jpegSegments(file: Uint8Array): Segment[] | null {
  const segments: Segment[] = [];
  let at = 2;
  while (at + 1 < file.length) {
    if (file[at] !== 0xff) return null;
    const marker = file[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd9) {
      segments.push({ marker, start: at, end: at + 2, payload: new Uint8Array() });
      return segments;
    }
    if (marker === 0xd8) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push({ marker, start: at, end: at + 2, payload: new Uint8Array() });
      at += 2;
      continue;
    }
    const length = u16be(file, at + 2);
    let end = at + 2 + length;
    if (length < 2 || end > file.length) return null;
    const payload = file.subarray(at + 4, end);
    if (marker === 0xda) {
      // Scan data runs to the next marker that isn't a stuffed byte or a restart.
      while (end + 1 < file.length) {
        if (file[end] === 0xff) {
          const next = file[end + 1] ?? 0;
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7) && next !== 0xff) break;
        }
        end += 1;
      }
    }
    segments.push({ marker, start: at, end, payload });
    at = end;
  }
  return null;
}

function segment(marker: number, payload: Uint8Array): Uint8Array {
  return concat([Uint8Array.of(0xff, marker), be16(payload.length + 2), payload]);
}

function stripJpeg(file: Uint8Array): Uint8Array | null {
  const segments = jpegSegments(file);
  if (segments === null) return null;
  const isXmp = (s: Segment) => s.marker === 0xe1 && ascii(s.payload, 0, XMP_ID.length) === XMP_ID;
  const hdr = segments.some(
    (s) =>
      (isXmp(s) && ascii(s.payload, 0, s.payload.length).includes(HDRGM)) ||
      (s.marker === 0xe2 && ascii(s.payload, 0, ISO_GAIN_MAP.length) === ISO_GAIN_MAP),
  );

  const parts: Uint8Array[] = [Uint8Array.of(0xff, 0xd8)];
  let mpf: { partIndex: number; payload: Uint8Array; start: number } | null = null;
  for (const s of segments) {
    const isApp = s.marker >= 0xe0 && s.marker <= 0xef;
    if (!isApp && s.marker !== 0xfe) {
      parts.push(file.subarray(s.start, s.end));
      continue;
    }
    const id = ascii(s.payload, 0, 32);
    if (s.marker === 0xe0 && id.startsWith("JFIF\0") && s.payload.length >= 14) {
      const jfif = s.payload.slice(0, 14);
      jfif[12] = 0;
      jfif[13] = 0;
      parts.push(segment(0xe0, jfif));
    } else if (s.marker === 0xe2 && id.startsWith("ICC_PROFILE\0")) {
      parts.push(file.subarray(s.start, s.end));
    } else if (s.marker === 0xe2 && id.startsWith("MPF\0") && hdr) {
      mpf = { partIndex: parts.length, payload: s.payload.slice(), start: s.start };
      parts.push(new Uint8Array());
    } else if (hdr && (isXmp(s) || (s.marker === 0xe2 && id.startsWith(ISO_GAIN_MAP)))) {
      if (!isXmp(s) || ascii(s.payload, 0, s.payload.length).includes(HDRGM)) {
        parts.push(file.subarray(s.start, s.end));
      }
    } else if (s.marker === 0xee && id.startsWith("Adobe")) {
      parts.push(file.subarray(s.start, s.end));
    }
  }
  if (mpf === null) return concat(parts);
  return withMpfImages(file, parts, { ...mpf, primaryEnd: segments.at(-1)?.end ?? file.length });
}

/**
 * Puts the MPF segment back, with the images its index points to appended
 * after EOI and their offsets recomputed for the smaller primary image.
 * MPF offsets count from the segment's TIFF header, just after `MPF\0`.
 */
function withMpfImages(
  file: Uint8Array,
  parts: Uint8Array[],
  mpf: { partIndex: number; payload: Uint8Array; start: number; primaryEnd: number },
): Uint8Array {
  const payload = mpf.payload;
  const tiff = 4;
  const le = ascii(payload, tiff, tiff + 2) === "II";
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const withoutMpf = () => concat(parts.filter((_, i) => i !== mpf.partIndex));
  try {
    const ifd = tiff + view.getUint32(tiff + 4, le);
    let entries = -1;
    let entryCount = 0;
    for (let i = 0; i < view.getUint16(ifd, le); i += 1) {
      const at = ifd + 2 + i * 12;
      if (view.getUint16(at, le) === 0xb002) {
        entryCount = view.getUint32(at + 4, le) / 16;
        entries = tiff + view.getUint32(at + 8, le);
      }
    }
    if (entries < 0) return withoutMpf();
    const oldBase = mpf.start + 4 + tiff;
    const images: { entry: number; bytes: Uint8Array }[] = [];
    for (let i = 1; i < entryCount; i += 1) {
      const entry = entries + i * 16;
      const size = view.getUint32(entry + 4, le);
      const offset = view.getUint32(entry + 8, le);
      // An index that points nowhere would point at the wrong bytes once rewritten.
      const from = oldBase + offset;
      if (offset === 0 || from < mpf.primaryEnd || from + size > file.length) return withoutMpf();
      images.push({ entry, bytes: file.subarray(oldBase + offset, oldBase + offset + size) });
    }
    // The segment keeps its size: only offsets in its payload change.
    const mpfLength = payload.length + 4;
    const before = parts.slice(0, mpf.partIndex).reduce((total, part) => total + part.length, 0);
    const newBase = before + 4 + tiff;
    const primaryLength = parts.reduce((total, part) => total + part.length, 0) + mpfLength;
    view.setUint32(entries + 4, primaryLength, le);
    let at = primaryLength;
    for (const image of images) {
      view.setUint32(image.entry + 8, at - newBase, le);
      at += image.bytes.length;
    }
    parts[mpf.partIndex] = segment(0xe2, payload);
    return concat([...parts, ...images.map((image) => image.bytes)]);
  } catch {
    return withoutMpf();
  }
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_KEEP = new Set([
  "IHDR",
  "PLTE",
  "tRNS",
  "IDAT",
  "IEND",
  "acTL",
  "fcTL",
  "fdAT",
  "iCCP",
  "sRGB",
  "gAMA",
  "cHRM",
  "cICP",
  "mDCv",
  "cLLi",
  "sBIT",
]);

type Chunk = { type: string; start: number; end: number; data: Uint8Array };

function pngChunks(file: Uint8Array): Chunk[] {
  const chunks: Chunk[] = [];
  let at = 8;
  while (at + 12 <= file.length) {
    const length = u32be(file, at);
    const type = ascii(file, at + 4, at + 8);
    const end = at + 12 + length;
    chunks.push({ type, start: at, end, data: file.subarray(at + 8, at + 8 + length) });
    at = end;
    if (type === "IEND") break;
  }
  return chunks;
}

function stripPng(file: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [file.subarray(0, 8)];
  for (const chunk of pngChunks(file)) {
    if (PNG_KEEP.has(chunk.type)) parts.push(file.subarray(chunk.start, chunk.end));
  }
  return concat(parts);
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

const WEBP_KEEP = new Set(["VP8X", "VP8 ", "VP8L", "ALPH", "ANIM", "ANMF", "ICCP"]);

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const pad = data.length % 2 === 1 ? Uint8Array.of(0) : new Uint8Array();
  return concat([latin1(type), le32(data.length), data, pad]);
}

function webpChunks(file: Uint8Array): Chunk[] {
  const chunks: Chunk[] = [];
  // Bytes past the RIFF size aren't part of the image.
  const riffEnd = Math.min(file.length, 8 + u32le(file, 4));
  let at = 12;
  while (at + 8 <= riffEnd) {
    const type = ascii(file, at, at + 4);
    const length = u32le(file, at + 4);
    const end = Math.min(riffEnd, at + 8 + length + (length % 2));
    const data = file.subarray(at + 8, Math.min(riffEnd, at + 8 + length));
    chunks.push({ type, start: at, end, data });
    at = end;
  }
  return chunks;
}

function stripWebp(file: Uint8Array): Uint8Array {
  const chunks = webpChunks(file);
  if (chunks[0]?.type !== "VP8X") return file.slice();

  const hasIcc = chunks.some((c) => c.type === "ICCP");

  const body: Uint8Array[] = [];
  for (const chunk of chunks) {
    if (chunk.type === "VP8X") {
      const header = chunk.data.slice();
      // I (ICC) follows what is kept; E (EXIF) and X (XMP) go; A and L stay.
      let flags = (header[0] ?? 0) & ~(0x20 | 0x08 | 0x04);
      if (hasIcc) flags |= 0x20;
      header[0] = flags;
      body.push(webpChunk("VP8X", header));
    } else if (WEBP_KEEP.has(chunk.type)) {
      body.push(file.subarray(chunk.start, chunk.end));
      // A file cut before a padding byte still gets one, so what follows stays aligned.
      if ((chunk.end - chunk.start) % 2 === 1) body.push(Uint8Array.of(0));
    }
  }
  const content = concat(body);
  return concat([latin1("RIFF"), le32(content.length + 4), latin1("WEBP"), content]);
}

// ---------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------

/** Data sub-blocks from `at`, through the zero-length terminator; null when the file ends first. */
function subBlocksEnd(file: Uint8Array, at: number): number | null {
  let end = at;
  while (end < file.length) {
    const size = file[end] ?? 0;
    end += 1 + size;
    if (size === 0) return end;
  }
  return null;
}

function stripGif(file: Uint8Array): Uint8Array | null {
  const flags = file[10] ?? 0;
  let at = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0);
  if (at > file.length) return null;
  const parts: Uint8Array[] = [file.subarray(0, at)];
  // A Graphic Control Extension governs the next graphic block: it goes with
  // an image, and with the plain text block that is dropped.
  let control: Uint8Array | null = null;
  while (at < file.length) {
    const introducer = file[at];
    if (introducer === 0x2c) {
      const packed = file[at + 9] ?? 0;
      const tableEnd = at + 10 + (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);
      const end = subBlocksEnd(file, tableEnd + 1);
      if (end === null) return null;
      if (control !== null) parts.push(control);
      control = null;
      parts.push(file.subarray(at, end));
      at = end;
    } else if (introducer === 0x21) {
      const label = file[at + 1];
      const end = subBlocksEnd(file, at + 2);
      if (end === null) return null;
      const application = ascii(file, at + 3, at + 14);
      const loop =
        label === 0xff && (application === "NETSCAPE2.0" || application === "ANIMEXTS1.0");
      if (label === 0xf9) control = file.subarray(at, end);
      else if (label === 0x01) control = null;
      else if (loop) parts.push(file.subarray(at, end));
      at = end;
    } else {
      break;
    }
  }
  parts.push(Uint8Array.of(0x3b));
  return concat(parts);
}
