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
type ValueCodec = { fromICAL: FromICAL };

const DECODES_SEMICOLONS = Symbol.for("natel.vcard.decodesSemicolons");

/**
 * ical.js decodes `\\`, `\,` and `\n` in a vCard text or 4.0 uri value, but
 * `\;` only inside a structured one such as N. RFC 2426 requires escaping
 * every semicolon in 3.0 text, RFC 6350 §3.4 allows it in 4.0, and Radicale
 * does it: `NOTE:a\;b` read as `a\;b` would show the backslash and be written
 * back as `a\\;b`, growing on each save. Decode it as the structured values
 * do. See DECISIONS.md 024.
 */
export function decodeEscapedSemicolons(): void {
  const values = ICAL.design.vcard.value as Record<string, ValueCodec | undefined>;
  for (const type of ["text", "uri"]) {
    const codec = values[type];
    if (!codec) throw new Error(`ical.js has no vCard ${type} value`);
    // Called again when index.ts is re-evaluated (hot reload, tests), it
    // finds the decoder already patched.
    if (codec.fromICAL[DECODES_SEMICOLONS]) continue;
    const fromICAL = codec.fromICAL.bind(codec);
    // ical.js passes `false` for a property value that isn't structured, `";"`
    // for a structured one, and nothing for a parameter, where a backslash is
    // a plain character (RFC 6868 escapes with `^`): only the first changes.
    const decoding: FromICAL = (value, structuredEscape) =>
      fromICAL(value, structuredEscape === false ? ";" : structuredEscape);
    decoding[DECODES_SEMICOLONS] = true;
    codec.fromICAL = decoding;
  }
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
      prop.setValue(source);
    }
  }
}

/**
 * A 4.0 data URI can carry backslashes before its semicolon beyond the one
 * escape `decodeEscapedSemicolons` reads: Radicale stores a `\\;` it receives
 * as `\\\;`, a media type other clients no longer read. No backslash belongs
 * in a data URI's parameters, so drop any left before a semicolon in `PHOTO`
 * and `LOGO`, which repairs such a card. See DECISIONS.md 023.
 */
export function unescapeDataUriSemicolons(raw: RawComponent): void {
  // A 3.0 uri is copied as written, with no escape decoded or added.
  if (versionOf(raw) !== "4.0") return;
  for (const prop of [...raw.getAllProperties("photo"), ...raw.getAllProperties("logo")]) {
    if ((prop.toJSON() as [string, unknown, string])[2] !== "uri") continue;
    const value = prop.getFirstValue();
    if (typeof value === "string" && value.startsWith("data:") && value.includes("\\;")) {
      prop.setValue(value.replace(/\\+;/g, ";"));
    }
  }
}
