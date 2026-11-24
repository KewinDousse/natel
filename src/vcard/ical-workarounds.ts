/**
 * Where ical.js reads a card differently from the clients that wrote it,
 * corrected when a card is parsed.
 */

import ICAL from "ical.js";
import type { RawComponent, RawProperty } from "../model/contact";
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

const READS_AS_DATE = Symbol.for("natel.vcard.readsAsDate");

type DateCodec = ValueCodec & {
  decorate?: (value: string) => unknown;
  [READS_AS_DATE]?: (value: string) => boolean;
};

/** The characters of a date or a time, in the basic or the extended form. */
const DATE_CHARACTERS = /^[\d\-:.+TZz]*$/;

const digitsOfDay = (value: string) => (value.split("T")[0] ?? "").replace(/\D/g, "");

/** Whether `short` is `long` with some of its `-` and `:` left out. */
const separatorsLeftOut = (short: string, long: string): boolean => {
  let matched = 0;
  for (const char of long) {
    if (char === short[matched]) matched++;
    else if (char !== "-" && char !== ":") return false;
  }
  return matched === short.length;
};

/**
 * ical.js reads and writes a date or a time by moving characters at fixed
 * places, whatever the value holds: `ANNIVERSARY:circa 1987` is written back
 * as `circ 187`, and `BDAY:Mai 1987` read as `Mai -19-87`. Take ical.js's
 * reading or writing only of a value made of a date's characters, whose
 * reading only adds `-` and `:`, reads back unchanged from its write and
 * makes a date object of the same day. Hold and write any other value as
 * written. See DECISIONS.md 064.
 */
export function keepNonDatesAsWritten(): void {
  // The 3.0 time codec, iCalendar's, makes no date object; the 4.0 one reads
  // the same times.
  const timeObject = (ICAL.design.vcard.value as Record<string, DateCodec | undefined>).time
    ?.decorate;
  if (!timeObject) throw new Error("ical.js has no vCard time object");
  // ical.js's date-time codecs of both versions call the 4.0 date and time
  // codecs, wrapped too: the outer call checks the whole value, so a nested
  // call runs ical.js's codec unchecked.
  let insideCodec = false;
  const outermost = <T>(run: () => T): T => {
    insideCodec = true;
    try {
      return run();
    } finally {
      insideCodec = false;
    }
  };
  for (const values of [ICAL.design.vcard.value, ICAL.design.vcard3.value]) {
    const codecs = values as Record<string, DateCodec | undefined>;
    // 3.0 has neither date-and-or-time nor timestamp. A 4.0 timestamp is
    // already held as written (keepTimestampsAsWritten): wrapped, it only
    // tells retypeTextBirthdays that it is no date.
    for (const type of ["date", "time", "date-time", "date-and-or-time", "timestamp"]) {
      const codec = codecs[type];
      // Called again when index.ts is re-evaluated (hot reload, tests), it
      // finds the codec already wrapped.
      if (!codec || codec[READS_AS_DATE]) continue;
      const fromICAL = codec.fromICAL.bind(codec);
      const toICAL = codec.toICAL.bind(codec);
      // ical.js's date object throws on some readings and takes others by
      // fixed places too: `1987-4-12` as 1987, `--0--00` as `--00-00`.
      const decorate = codec.decorate ?? timeObject;
      const sameDayAsDate = (read: string): boolean => {
        try {
          return digitsOfDay(String(decorate(read))) === digitsOfDay(read);
        } catch {
          return false;
        }
      };
      // What ical.js writes of its reading of `value`, when that is the same
      // date.
      const writtenBack = (read: unknown, value: string): string | undefined => {
        if (typeof read !== "string") return undefined;
        const written = toICAL(read);
        return separatorsLeftOut(value, read) && fromICAL(written) === read && sameDayAsDate(read)
          ? written
          : undefined;
      };
      // iCalendar shares some of these codecs: give vCard its own.
      codecs[type] = {
        ...codec,
        [READS_AS_DATE]: (held) => DATE_CHARACTERS.test(held) && sameDayAsDate(held),
        fromICAL: (value, structuredEscape) => {
          if (insideCodec) return fromICAL(value, structuredEscape);
          if (!DATE_CHARACTERS.test(value)) return value;
          return outermost(() => {
            const read = fromICAL(value, structuredEscape);
            return writtenBack(read, value) === undefined ? value : read;
          });
        },
        toICAL: (value) => {
          if (insideCodec) return toICAL(value);
          if (!DATE_CHARACTERS.test(value)) return value;
          return outermost(() => writtenBack(value, value) ?? value);
        },
      };
    }
  }
}

/**
 * In a 3.0 card, ical.js reads `TZ` as a UTC offset, which would cut an
 * untouched `TZ:Europe/Zurich`, the 4.0 form some clients write there. Natel
 * doesn't show it: hold it as written. See DECISIONS.md 061.
 */
export function keepVcard3OffsetsAsWritten(): void {
  const values = ICAL.design.vcard3.value;
  if (!values["utc-offset"]) throw new Error("ical.js has no vCard 3.0 utc-offset value");
  values["utc-offset"] = { fromICAL: (value: string) => value, toICAL: (value: string) => value };
}

/**
 * ical.js writes back an `integer`, `float` or `boolean` as the number or
 * boolean it read, rewriting an untouched `007` as `7`. Hold each as written,
 * in both versions. See DECISIONS.md 060.
 */
export function keepNumbersAndBooleansAsWritten(): void {
  const asWritten = (value: string) => value;
  for (const values of [ICAL.design.vcard.value, ICAL.design.vcard3.value]) {
    for (const type of ["integer", "float", "boolean"] as const) {
      const codec = values[type];
      if (!codec) throw new Error(`ical.js has no vCard ${type} value`);
      // iCalendar shares these codecs: give vCard its own.
      values[type] = { ...codec, fromICAL: asWritten, toICAL: asWritten };
    }
  }
}

/**
 * Held as written, an `integer`, `float` or `boolean` value is also written
 * unescaped, so an edited line break would cut the card. Give each property
 * Natel edits its version's default type, with its value decoded as that
 * type reads it. See DECISIONS.md 060.
 */
export function retypeEditedNumbersAndBooleans(edited: RawProperty[]): void {
  for (const prop of edited) {
    const type = (prop.toJSON() as [string, unknown, string])[2];
    if (type !== "integer" && type !== "float" && type !== "boolean") continue;
    const defaultType = prop.getDefaultType();
    // A uri is held as written too (ADR 053). 3.0 and 4.0 decode the other
    // default types alike.
    const codec =
      defaultType === "uri"
        ? undefined
        : (ICAL.design.vcard.value as Record<string, ValueCodec | undefined>)[defaultType];
    const decode = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(decode);
      return codec && typeof value === "string" ? codec.fromICAL(value, ";") : value;
    };
    const values = prop.getValues().map(decode);
    prop.resetType(defaultType);
    if (values.length <= 1) prop.setValue(values[0] ?? "");
    else prop.setValues(values);
  }
}

/**
 * After a nested card, such as a vCard 2.1 `AGENT`, ical.js reads the rest
 * with the 3.0 types, which split a NOTE at each unescaped comma. A card not
 * opening with `VERSION:3.0` is written with the 4.0 types, where a NOTE
 * keeps only its first value, so join it back. See DECISIONS.md 066.
 */
export function joinSplitNotes(raw: RawComponent): void {
  if (versionOf(raw) === "3.0") return;
  for (const prop of raw.getAllProperties("note")) {
    const values = prop.getValues();
    if (values.length > 1) prop.setValue(values.map(String).join(","));
  }
}

/**
 * ical.js's vCard 4.0 timestamp codec, used only by REV, drops a UTC offset
 * and garbles the extended and date-only forms clients write. Hold a 4.0
 * timestamp as written; `revisionOf` reads each of those forms. See
 * DECISIONS.md 057.
 */
export function keepTimestampsAsWritten(): void {
  const values = ICAL.design.vcard.value as Record<string, ValueCodec | undefined>;
  if (!values.timestamp) throw new Error("ical.js has no vCard timestamp value");
  const asWritten = (value: string) => value;
  // The codec is iCalendar's date-time; give 4.0 its own.
  values.timestamp = { fromICAL: asWritten, toICAL: asWritten };
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
 * hydrated, and a birthday held as written (ADR 064) is shown as the date
 * ical.js makes of its digits ("12 avril 1987" as the year 12). Retype such
 * properties as text so the card parses and the value round-trips. See
 * DECISIONS.md 012 and 064.
 */
export function retypeTextBirthdays(raw: RawComponent): void {
  // ical.js reads a card with VERSION 2.1 or none with the 3.0 design.
  const codecs = (
    versionOf(raw) === "4.0" ? ICAL.design.vcard.value : ICAL.design.vcard3.value
  ) as Record<string, DateCodec | undefined>;
  for (const prop of raw.getAllProperties("bday")) {
    const [, , type, value] = prop.toJSON() as [string, unknown, string, unknown];
    if (type === "text") continue;
    const codec = codecs[type];
    const held = String(value ?? "");
    const readsAsDate = codec?.[READS_AS_DATE];
    if (readsAsDate ? readsAsDate(held) : hydrates(prop)) continue;
    prop.resetType("text");
    prop.setValue(ICAL.design.vcard.value.text.fromICAL(held, ";"));
  }
}

function hydrates(prop: RawProperty): boolean {
  try {
    prop.getFirstValue();
    return true;
  } catch {
    return false;
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

/**
 * A content line with its line ending and folded continuations, split as
 * ical.js splits them: a line ends at `\n`, a bare `\r` is part of the line.
 */
const CONTENT_LINE = /[^\n]*(?:\n|$)(?:[ \t][^\n]*(?:\n|$))*/g;

const unfoldLine = (line: string) => line.replace(/\r?\n[ \t]/g, "");

/** A text's content lines, and the index of its first `BEGIN:VCARD`, or -1. */
function splitAtBegin(text: string): { lines: string[]; begin: number } {
  const lines = text.match(CONTENT_LINE) ?? [];
  const begin = lines.findIndex((line) =>
    /^[ \t]*BEGIN:VCARD[ \t]*\r?\n?$/i.test(unfoldLine(line)),
  );
  return { lines, begin };
}

/**
 * ical.js reads and writes a card with the types of its version only when
 * `VERSION` is its first property, where RFC 6350 §6.7.9 puts it. Move a
 * later `VERSION` line there, unchanged, before ical.js reads the card. See
 * DECISIONS.md 054.
 */
function versionFirst(text: string): string {
  // The usual card, without splitting a text that may hold a photo.
  if (/^[ \t]*BEGIN:VCARD[ \t]*\r?\nVERSION[;:]/i.test(text)) return text;
  const { lines, begin } = splitAtBegin(text);
  if (begin === -1) return text;
  // The card's own VERSION, not that of a component nested in it, such as a
  // vCard 2.1 AGENT card. ical.js nests on any BEGIN and closes on any END.
  let nested = 0;
  let version = -1;
  for (let i = begin + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Unfold only a line that may matter, not a long PHOTO. ical.js drops an
    // empty line, so a fold right after one starts the line.
    if (!/^(?:\r?\n[ \t])*[BEV]/i.test(line)) continue;
    const unfolded = unfoldLine(line);
    if (/^BEGIN:/i.test(unfolded)) nested++;
    else if (/^END:/i.test(unfolded)) {
      if (nested === 0) {
        if (version === -1 || version === begin + 1) return text;
        lines.splice(begin + 1, 0, ...lines.splice(version, 1));
        return lines.join("");
      }
      nested--;
    } else if (nested === 0 && version === -1 && /^VERSION[;:]/i.test(unfolded)) {
      version = i;
    }
  }
  // Without its END, ical.js rejects the card anyway.
  return text;
}

/**
 * ical.js reads a card with the 3.0 types unless its first property is an
 * ungrouped `VERSION:4.0`, but edits and writes it with the 4.0 types unless
 * that property is `VERSION:3.0`. After `versionFirst`, read a card whose
 * first property is neither, such as a card without `VERSION`, as opening with
 * `VERSION:4.0`, then drop that line, so it is read with the types it is
 * written with. A nested card, such as a vCard 2.1 `AGENT`, still switches
 * ical.js to the 3.0 types from its first property on. Throws on a text that
 * is not one vCard. See DECISIONS.md 062.
 */
export function parseWithWrittenTypes(text: string): CardJCal {
  const card = versionFirst(text);
  // Parsed as it is first: the usual card opens with VERSION 3.0 or 4.0, and
  // only ical.js knows which line it takes as the first property.
  const jCal: unknown = ICAL.parse(card);
  if (!isCard(jCal)) throw new Error("not a vCard");
  const first: readonly unknown[] = Array.isArray(jCal[1][0]) ? jCal[1][0] : [];
  const [name, params, , value] = first;
  const grouped = typeof params === "object" && params !== null && "group" in params;
  if (name === "version" && (value === "3.0" || (value === "4.0" && !grouped))) return jCal;
  const { lines, begin } = splitAtBegin(card);
  if (begin === -1) throw new Error("not a vCard");
  lines.splice(begin + 1, 0, "VERSION:4.0\r\n");
  const read: unknown = ICAL.parse(lines.join(""));
  if (!isCard(read)) throw new Error("not a vCard");
  read[1].shift();
  return read;
}

type CardJCal = [name: "vcard", properties: unknown[], components: unknown[]];

const isCard = (jCal: unknown): jCal is CardJCal =>
  Array.isArray(jCal) && jCal[0] === "vcard" && Array.isArray(jCal[1]) && Array.isArray(jCal[2]);
