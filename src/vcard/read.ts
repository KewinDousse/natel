/**
 * Read-only accessors for the views: type values, organisation, title,
 * address, birthday, note and groups.
 */

import type {
  AddressSource,
  Contact,
  RawComponent,
  RawProperty,
  VCardAddressField,
} from "../model/contact";
import { appleOmittedYear } from "./apple-birthday";
import { addressCodesOf, appleLabelOf, groupOf, valueText } from "./fields";

export type TypedProp = { params?: Record<string, string | string[]> };

/**
 * TYPE parameter values of a TEL/EMAIL/ADR property, lowercased. Handles
 * both spellings ical.js emits (lowercase `type` on parsed cards) and the
 * uppercase `TYPE` constructed models use, plus string/array forms.
 */
export function typeValuesOf(typed: TypedProp): string[] {
  const raw = typed.params?.TYPE ?? typed.params?.type;
  if (raw === undefined) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map((value) => value.toLowerCase());
}

/**
 * ORG value for display, read from the parsed raw component.
 *
 * Multi-part values (org name + units) are joined with ", ".
 */
export function orgOf(contact: Contact): string {
  return readOrgDisplay(contact.raw);
}

/** @internal Read ORG first component from a raw component. */
export function readOrg(raw: RawComponent): string {
  const value = raw.getFirstPropertyValue("org");
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : "";
  }
  return typeof value === "string" ? value : "";
}

/** @internal Read ORG from raw and join all components for display. */
function readOrgDisplay(raw: RawComponent): string {
  const value = raw.getFirstPropertyValue("org");
  if (Array.isArray(value)) {
    return value
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(", ");
  }
  return typeof value === "string" ? value : "";
}

/** TITLE (job title) value for display, read from the parsed raw component. */
export function jobTitleOf(contact: Contact): string {
  return readTitle(contact.raw);
}

/** @internal Read TITLE from a raw component. */
export function readTitle(raw: RawComponent): string {
  const value = raw.getFirstPropertyValue("title");
  return typeof value === "string" ? value : "";
}

/** An ADR property as read: its parts, type and label, with the property itself. */
export type VCardAddress = Omit<VCardAddressField, "source" | "dropLabel" | "customLabel"> & {
  source: AddressSource;
};

/** Every ADR property of the card, in order. */
export function addressesOf(contact: Contact): VCardAddress[] {
  return readAddresses(contact.raw);
}

/** @internal Read every ADR from a raw component. */
export function readAddresses(raw: RawComponent): VCardAddress[] {
  return raw.getAllProperties("adr").map((prop) => readAddress(raw, prop));
}

/**
 * An ADR value's parts as text: the seven of RFC 6350, empty when absent,
 * then any extra ones. A value that isn't structured is its first part, as
 * for N.
 */
export function addressPartsOf(value: unknown): string[] {
  const parts = structuredValue(value).map((part) => String(part ?? ""));
  return [...Array.from({ length: 7 }, (_, i) => parts[i] ?? ""), ...parts.slice(7)];
}

/** A value as its parts: one that isn't structured is its first part. */
export function structuredValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

/** TYPE values among an ADR's parameters, as written. */
export function addressTypesOf(params: Record<string, string | string[]>): string[] {
  const rawType = params.TYPE ?? params.type;
  return Array.isArray(rawType)
    ? rawType.map((v) => String(v))
    : typeof rawType === "string"
      ? [rawType]
      : [];
}

function readAddress(raw: RawComponent, prop: RawProperty): VCardAddress {
  const jcal = prop.toJSON() as [string, Record<string, string | string[]>, string, unknown];
  const value = prop.getFirstValue();
  const params = { ...(jcal[1] ?? {}) };
  const rawParts = addressPartsOf(value);
  const label = appleLabelOf(raw, prop);
  const abadr = addressCodesOf(raw, groupOf(prop));
  return {
    source: { value, params, ...(abadr.length > 0 ? { abadr } : {}) },
    poBox: rawParts[0] ?? "",
    extended: rawParts[1] ?? "",
    street: rawParts[2] ?? "",
    locality: rawParts[3] ?? "",
    region: rawParts[4] ?? "",
    postalCode: rawParts[5] ?? "",
    country: rawParts[6] ?? "",
    extraParts: rawParts.slice(7),
    type: addressTypesOf(params),
    ...(label === undefined ? {} : { label }),
  };
}

/** BDAY as plain date parts plus the raw stored text (used for copy). */
export type Birthday = {
  /** Property value as ical.js holds it: a date it reads in the extended
   *  form ("19870314" as "1987-03-14", "--0314" as "--03-14"), any other
   *  value as written ("Mai 1987", ADR 064). */
  source: string;
  year: number | null;
  month: number | null;
  day: number | null;
  /** jCal value type (e.g. "text", "date", "date-time"). When undefined the default date type applies. */
  valueType?: string;
};

/**
 * BDAY for display, read from the parsed raw component. Partial dates are
 * kept as-is: a missing part is null, never a zero or invented value.
 */
export function birthdayOf(contact: Contact): Birthday | null {
  return readBirthday(contact.raw);
}

/** @internal Read BDAY from a raw component. */
export function readBirthday(raw: RawComponent): Birthday | null {
  const prop = raw.getFirstProperty("bday");
  if (!prop) return null;
  const jcal = prop.toJSON() as [string, Record<string, string | string[]>, string, unknown];
  const source = String(jcal[3] ?? "");
  const valueType = jcal[2] || undefined;
  let value: unknown;
  try {
    value = prop.getFirstValue();
  } catch {
    // ical.js retyped a free-text value as a date and cannot hydrate it.
    return { source, valueType: "text", year: null, month: null, day: null };
  }
  if (value !== null && typeof value === "object") {
    const t = value as { year?: unknown; month?: unknown; day?: unknown };
    const parts = {
      year: typeof t.year === "number" ? t.year : null,
      month: typeof t.month === "number" ? t.month : null,
      day: typeof t.day === "number" ? t.day : null,
    };
    return { source, valueType, ...parts, year: appleOmittedYear(raw, jcal[1], parts) };
  }
  return { source, valueType, year: null, month: null, day: null };
}

/**
 * NOTE text, read from the parsed raw component. Returns "" when absent;
 * whitespace (including line breaks) is preserved for pre-wrap display.
 */
export function noteOf(contact: Contact): string {
  return readNote(contact.raw);
}

/**
 * @internal Read NOTE from a raw component. ical.js reads a 3.0 NOTE as a
 * list split at each unescaped comma, which a loose exporter leaves in: join
 * it back into the text as written.
 */
export function readNote(raw: RawComponent): string {
  return (raw.getFirstProperty("note")?.getValues() ?? []).map(String).join(",");
}

/**
 * CATEGORIES (groups) values, flattened across all properties — so a card
 * with two CATEGORIES lines yields all values in order. Arrangement of the
 * values is display-only; nothing here ever writes to `raw`.
 */
export function groupsOf(contact: Contact): string[] {
  const groups: string[] = [];
  for (const prop of contact.raw.getAllProperties("categories")) {
    for (const value of prop.getValues()) {
      const name = typeof value === "string" ? value.trim() : "";
      if (name.length > 0) groups.push(name);
    }
  }
  return groups;
}

/**
 * True for a group card (ADR 022): `KIND:group` (vCard 4.0) or
 * `X-ADDRESSBOOKSERVER-KIND:group` (Apple's 3.0 form), in any case.
 */
export function isGroupCard(contact: Contact): boolean {
  return ["kind", "x-addressbookserver-kind"].some((name) =>
    contact.raw.getAllProperties(name).some(
      (prop) =>
        String(prop.getFirstValue() ?? "")
          .trim()
          .toLowerCase() === "group",
    ),
  );
}

/**
 * A group card's name (its FN, else its N, else its UID, trimmed) and the
 * UIDs of its members, from `MEMBER` and `X-ADDRESSBOOKSERVER-MEMBER`, with
 * or without `urn:uuid:`.
 */
export function groupCardOf(contact: Contact): { name: string; members: string[] } {
  const fn = contact.fields.fn.trim();
  const { n: parts } = contact.fields;
  const n = [parts.prefix, parts.given, parts.additional, parts.family, parts.suffix]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ");
  const name = fn || n || contact.uid.trim();
  const members: string[] = [];
  for (const prop of [
    ...contact.raw.getAllProperties("member"),
    ...contact.raw.getAllProperties("x-addressbookserver-member"),
  ]) {
    const value = valueText(contact.raw, prop).trim();
    if (value.length > 0) members.push(value.replace(/^urn:uuid:/i, ""));
  }
  return { name, members };
}

/** A date a card records about itself, such as its `REV`. */
export type CardDate = {
  /** Local midnight for a date alone, local time for a time without a zone. */
  date: Date;
  /** False for a date alone. */
  hasTime: boolean;
};

// A date, basic or extended, then an optional time down to the hour, fraction and zone.
const CARD_DATE =
  /^(\d{4})-?(\d{2})-?(\d{2})(?:T(\d{2})(?::?(\d{2})(?::?(\d{2})([.,]\d+)?)?)?(?:(Z)|([+-]\d{2})(?::?(\d{2}))?)?)?$/i;

/**
 * A `REV`, `CREATED` or `X-CREATED` value as a date, or null when it isn't
 * one: clients write them with or without separators, zone or time.
 */
function parseCardDate(text: string): CardDate | null {
  const match = CARD_DATE.exec(text.trim());
  if (!match) return null;
  const [, year = "", month = "", day = "", hour = "00", minute = "00", second = "00"] = match;
  const [fraction, utc, offsetHour, offsetMinute = "00"] = match.slice(7);
  // ECMAScript rolls 31 April over to 1 May, and 24:00 over to the next day.
  const utcDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (utcDay.getUTCDate() !== Number(day) || Number(hour) > 23) return null;
  const ms = fraction ? `.${fraction.slice(1, 4).padEnd(3, "0")}` : "";
  const zone = utc ? "Z" : offsetHour ? `${offsetHour}:${offsetMinute}` : "";
  // Without a zone, ECMAScript reads a date and time as local time.
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${ms}${zone}`);
  return Number.isNaN(date.getTime()) ? null : { date, hasTime: match[4] !== undefined };
}

/** The value of a property as the card writes it, or as ical.js normalised it. */
function cardDateOf(prop: RawProperty): CardDate | null {
  const jcal = prop.toJSON() as [string, unknown, string, unknown];
  return typeof jcal[3] === "string" ? parseCardDate(jcal[3]) : null;
}

/**
 * When the card was last changed: its `REV` (RFC 6350 §6.7.4), or null
 * without a readable one. Read-only.
 */
export function revisionOf(contact: Contact): CardDate | null {
  const rev = contact.raw.getFirstProperty("rev");
  return rev ? cardDateOf(rev) : null;
}

/**
 * When the card was created: its first readable `CREATED` or `X-CREATED`,
 * which some clients write though RFC 6350 has no such property, with that
 * property. Read-only.
 */
export function readCreated(raw: RawComponent): { prop: RawProperty; date: CardDate } | null {
  for (const prop of [...raw.getAllProperties("created"), ...raw.getAllProperties("x-created")]) {
    const date = cardDateOf(prop);
    if (date) return { prop, date };
  }
  return null;
}

/** When the card was created, from `CREATED` or `X-CREATED`, or null. Read-only. */
export function createdOf(contact: Contact): CardDate | null {
  return readCreated(contact.raw)?.date ?? null;
}
