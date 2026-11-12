/**
 * Where ical.js reads a card differently from the clients that wrote it,
 * corrected when a card is parsed.
 */

import ICAL from "ical.js";
import type { RawComponent } from "../model/contact";
import { versionOf } from "./fields";

type FromICAL = ((value: string, structuredEscape?: string | false) => unknown) & {
  [DECODES_SEMICOLONS]?: true;
};
type ValueCodec = { fromICAL: FromICAL; toICAL: (value: string) => string };

const DECODES_SEMICOLONS = Symbol.for("natel.vcard.decodesSemicolons");

/**
 * ical.js decodes `\\`, `\,` and `\n` in a vCard text value, but `\;` only
 * inside a structured one such as N. RFC 2426 requires escaping every
 * semicolon in 3.0 text, RFC 6350 §3.4 allows it in 4.0, and Radicale does
 * it: `NOTE:a\;b` read as `a\;b` would show the backslash and be written
 * back as `a\\;b`, growing on each save. Decode it as the structured values
 * do. See DECISIONS.md 024.
 */
export function decodeEscapedSemicolons(): void {
  const codec = (ICAL.design.vcard.value as Record<string, ValueCodec | undefined>).text;
  if (!codec) throw new Error("ical.js has no vCard text value");
  // Called again when index.ts is re-evaluated (hot reload, tests), it finds
  // the decoder already patched.
  if (codec.fromICAL[DECODES_SEMICOLONS]) return;
  const fromICAL = codec.fromICAL.bind(codec);
  // ical.js passes `false` for a property value that isn't structured, `";"`
  // for a structured one, and nothing for a parameter, where a backslash is
  // a plain character (RFC 6868 escapes with `^`): only the first changes.
  const decoding: FromICAL = (value, structuredEscape) =>
    fromICAL(value, structuredEscape === false ? ";" : structuredEscape);
  decoding[DECODES_SEMICOLONS] = true;
  codec.fromICAL = decoding;
}

/**
 * ical.js reads and writes a 4.0 uri as text, which would escape the comma
 * of an untouched `GEO:geo:46.5,6.6` or data URI. Hold a 4.0 uri as written,
 * as ical.js does a 3.0 one; `valueText` and `writtenValue` decode and
 * encode it where Natel shows or edits one. See DECISIONS.md 053.
 */
export function keepUrisAsWritten(): void {
  const codec = (ICAL.design.vcard.value as Record<string, ValueCodec | undefined>).uri;
  if (!codec) throw new Error("ical.js has no vCard uri value");
  codec.fromICAL = (value) => value;
  codec.toICAL = (value) => value;
}

/** RFC 2426 §2.3 requires semicolons escaped in every 3.0 text value. */
export function encodeVcard3Semicolons(): void {
  const values = ICAL.design.vcard3.value;
  const text = values.text;
  if (!text) throw new Error("ical.js has no vCard 3.0 text value");
  // The two versions share a codec; give 3.0 its own encoder.
  values.text = {
    ...text,
    toICAL: (value: string, structuredEscape?: string | false) =>
      text.toICAL(value, structuredEscape === false ? ";" : structuredEscape),
  };
}

/**
 * ical.js's vCard 3.0 `detectType` types every BDAY as date/date-time and
 * drops `VALUE=text`, so a free-text birthday ("circa 1987") throws when
 * hydrated and is mangled when stringified. Retype such properties as text
 * so the card parses and the value round-trips. See DECISIONS.md 012.
 */
export function retypeTextBirthdays(raw: RawComponent): void {
  for (const prop of raw.getAllProperties("bday")) {
    try {
      prop.getFirstValue();
    } catch {
      const jcal = prop.toJSON() as [string, unknown, string, unknown];
      const source = String(jcal[3] ?? "");
      prop.resetType("text");
      prop.setValue(ICAL.design.vcard.value.text.fromICAL(source, ";"));
    }
  }
}

/**
 * Radicale escapes the semicolon of a 4.0 data URI it stores (`\;`), and
 * stores a `\\;` it receives as `\\\;`, a media type other clients no longer
 * read. Keep a single `\;` as read, and turn a longer run of backslashes
 * before a semicolon in `PHOTO` and `LOGO` back into `;`, which repairs such
 * a card. See DECISIONS.md 023 and 053.
 */
export function unescapeDataUriSemicolons(raw: RawComponent): void {
  // A 3.0 uri carries no escape, so a backslash there is data.
  if (versionOf(raw) === "3.0") return;
  for (const prop of [...raw.getAllProperties("photo"), ...raw.getAllProperties("logo")]) {
    if ((prop.toJSON() as [string, unknown, string])[2] !== "uri") continue;
    const value = prop.getFirstValue();
    // URI schemes are case-insensitive (RFC 3986 §3.1).
    if (typeof value !== "string" || !/^data:/i.test(value)) continue;
    const repaired = value.replace(/\\{2,};/g, ";");
    if (repaired !== value) prop.setValue(repaired);
  }
}
