/**
 * vCard parse/serialise.
 *
 * The ONLY module that imports ical.js. UI code imports parse/serialise from
 * here, never from ical.js directly.
 *
 * EXTENSION (edit task): NICKNAME, ADR, BDAY, ORG, TITLE, URL, NOTE are now
 * part of the editable subset. Everything the UI does not edit round-trips
 * byte-preserved via raw.
 */

import ICAL from "ical.js";
import type {
  Contact,
  ContactField,
  EditableFields,
  PhotoEdit,
  RawComponent,
  RawProperty,
} from "../model/contact";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert a 5-element N structured value to our model struct. */
function nValueToStruct(value: unknown): EditableFields["n"] {
  const arr = Array.isArray(value) ? (value as string[]) : [String(value)];
  return {
    family: arr[0] ?? "",
    given: arr[1] ?? "",
    additional: arr[2] ?? "",
    prefix: arr[3] ?? "",
    suffix: arr[4] ?? "",
  };
}

/** Convert a RawProperty to a ContactField. */
function propertyToField(prop: RawProperty): ContactField {
  const jcal = prop.toJSON() as [string, Record<string, string | string[]>, string, unknown];
  const params = jcal[1] ?? {};
  const type = (jcal[2] as string) ?? undefined;
  const rawValue = prop.getFirstValue();

  let value: string;
  if (
    rawValue !== null &&
    typeof rawValue === "object" &&
    "value" in (rawValue as unknown as Record<string, unknown>)
  ) {
    // binary / structured value object
    value = (rawValue as unknown as { value: string }).value;
  } else {
    value = String(rawValue ?? "");
  }

  return { value, type, params };
}

function groupOf(prop: RawProperty): string | undefined {
  const params = (prop.toJSON() as [string, Record<string, string | string[]>])[1];
  const group = params.group ?? params.GROUP;
  return typeof group === "string" && group.length > 0 ? group.toLowerCase() : undefined;
}

function appleLabelProperty(raw: RawComponent, prop: RawProperty): RawProperty | undefined {
  const group = groupOf(prop);
  if (group === undefined) return undefined;
  return raw.getAllProperties("x-ablabel").find((label) => {
    const value = label.getFirstValue();
    return groupOf(label) === group && typeof value === "string" && value.length > 0;
  });
}

function appleLabelOf(raw: RawComponent, prop: RawProperty): string | undefined {
  const value = appleLabelProperty(raw, prop)?.getFirstValue();
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function labelledField(raw: RawComponent, prop: RawProperty): ContactField {
  const field = propertyToField(prop);
  const label = appleLabelOf(raw, prop);
  return label === undefined ? field : { ...field, label };
}

function dropAppleLabel(raw: RawComponent, group: string | string[] | undefined): void {
  if (typeof group !== "string" || group.length === 0) return;
  for (const prop of raw.getAllProperties("x-ablabel")) {
    if (groupOf(prop) === group.toLowerCase()) raw.removeProperty(prop);
  }
}

/** Rebuild a RawProperty from a ContactField. */
function fieldToProperty(name: string, field: ContactField): RawProperty {
  const prop = new ICAL.Property(name);
  if (field.type) {
    prop.resetType(field.type);
  }
  prop.setValue(field.value);
  if (field.params) {
    for (const [key, val] of Object.entries(field.params)) {
      prop.setParameter(key, val);
    }
  }
  return prop;
}

/** Copy field data onto an existing property in place, preserving its position in the component. */
function updatePropertyInPlace(prop: RawProperty, field: ContactField): void {
  if (field.type) {
    prop.resetType(field.type);
  }
  prop.setValue(field.value);

  // Remove any existing params that are absent from the incoming field,
  // so deleted/reordered properties don't carry stale parameters.
  const currentParams =
    (prop.toJSON() as [string, Record<string, string | string[]>, string, unknown])[1] ?? {};
  const fieldKeys = new Set(field.params ? Object.keys(field.params) : []);
  for (const key of Object.keys(currentParams)) {
    if (!fieldKeys.has(key)) {
      prop.removeParameter(key);
    }
  }
  // Apply the incoming params.
  if (field.params) {
    for (const [key, val] of Object.entries(field.params)) {
      prop.setParameter(key, val);
    }
  }
}

/**
 * Update a group of properties (e.g. TEL, EMAIL) in place on the component.
 *
 * Existing properties are updated at their current position; only the delta
 * is added or removed, preserving property order and enabling byte-for-byte
 * round-trip when ical.js allows it.
 */
function replacePropertiesInPlace(
  raw: RawComponent,
  propName: string,
  newFields: ContactField[],
): void {
  const existing = raw.getAllProperties(propName);
  const min = Math.min(existing.length, newFields.length);

  // Update existing properties that have a matching edited field.
  for (let i = 0; i < min; i++) {
    const prop = existing[i];
    if (prop) {
      updatePropertyInPlace(prop, newFields[i] as ContactField);
    }
  }

  // Remove excess existing properties (edited list is shorter).
  for (let i = min; i < existing.length; i++) {
    const prop = existing[i];
    if (prop) {
      raw.removeProperty(prop);
    }
  }

  // Add new properties (edited list is longer).
  for (let i = min; i < newFields.length; i++) {
    const field = newFields[i];
    if (field) {
      raw.addProperty(fieldToProperty(propName, field));
    }
  }
}

// ---------------------------------------------------------------------------
// Serialiser helpers for the extended editable subset
// ---------------------------------------------------------------------------

/**
 * Update or remove a single-string property (NICKNAME, TITLE).
 * Preserves multi-values beyond the first (NICKNAME:Jean,Petit stays intact)
 * when the property supports it (ical.js multi-value types).
 */
function updateStringProperty(raw: RawComponent, name: string, value: string): void {
  const prop = raw.getFirstProperty(name);
  if (value.length > 0) {
    if (prop) {
      setPropertyValue(prop, value);
    } else {
      const newProp = new ICAL.Property(name);
      newProp.setValue(value);
      raw.addProperty(newProp);
    }
  } else if (prop) {
    // When clearing: keep the property if there are remaining values beyond the first,
    // preserving multi-value properties like NICKNAME:Jean,Petit
    const values = prop.getValues();
    if (Array.isArray(values) && values.length > 1) {
      values.shift();
      try {
        prop.setValues(values);
      } catch {
        prop.removeParameter("value");
        prop.setValue(values.join(","));
      }
    } else {
      raw.removeProperty(prop);
    }
  }
}

/**
 * Update or remove the FIRST occurrence of a multi-string property (URL, NOTE).
 * Subsequent properties with the same name are left untouched in raw.
 * Preserves multi-values beyond the first when the property supports it.
 */
function updateFirstStringProperty(raw: RawComponent, name: string, value: string): void {
  const prop = raw.getFirstProperty(name);
  if (value.length > 0) {
    if (prop) {
      setPropertyValue(prop, value);
    } else {
      const newProp = new ICAL.Property(name);
      newProp.setValue(value);
      raw.addProperty(newProp);
    }
  } else if (prop) {
    // When clearing: keep the property if there are remaining values beyond the first
    const values = prop.getValues();
    if (Array.isArray(values) && values.length > 1) {
      values.shift();
      try {
        prop.setValues(values);
      } catch {
        prop.setValue(values.join(","));
      }
    } else {
      raw.removeProperty(prop);
    }
  }
}

/**
 * Set a property value while preserving multi-values beyond the first.
 * Falls back to setValue when the property type does not support setValues.
 */
function setPropertyValue(prop: RawProperty, value: string): void {
  const values = prop.getValues();
  if (Array.isArray(values) && values.length > 1) {
    values[0] = value;
    try {
      prop.setValues(values);
      return;
    } catch {
      // Property type does not support setValues — fall through to setValue
    }
  }
  prop.setValue(value);
}

/**
 * Update the first ADR property in place. Only the parts and TYPE the user
 * changed are rewritten, so untouched components (including list values like
 * "Rue A,Bât B") and parameter order survive. Other ADR properties remain
 * untouched.
 */
function updateAddressProperty(raw: RawComponent, adr: EditableFields["adr"]): void {
  if (adr === null) return;
  const edited = [
    adr.poBox,
    adr.extended,
    adr.street,
    adr.locality,
    adr.region,
    adr.postalCode,
    adr.country,
    ...adr.extraParts,
  ];
  const current = readAddress(raw);
  const currentParts =
    current === null
      ? []
      : [
          current.poBox,
          current.extended,
          current.street,
          current.locality,
          current.region,
          current.postalCode,
          current.country,
          ...current.extraParts,
        ];
  const typeChanged = JSON.stringify(current?.type ?? []) !== JSON.stringify(adr.type);
  const partsChanged = JSON.stringify(currentParts) !== JSON.stringify(edited);
  if (current !== null && !typeChanged && !partsChanged) return;

  let prop = raw.getFirstProperty("adr");
  if (!edited.some((p) => p.length > 0) && adr.extraParts.length === 0) {
    if (prop) raw.removeProperty(prop);
    return;
  }
  if (!prop) {
    prop = new ICAL.Property("adr");
    raw.addProperty(prop);
  }

  if (partsChanged) {
    // Keep the parsed value of every part the user left alone.
    const parsed = prop.getFirstValue();
    const parsedParts: unknown[] = Array.isArray(parsed) ? parsed : [];
    prop.setValue(
      edited.map((part, i) => (currentParts[i] === part ? (parsedParts[i] ?? part) : part)),
    );
  }

  if (typeChanged) {
    // Clear both spellings ical.js may hold, then set from the field
    const jcal = prop.toJSON() as [string, Record<string, string | string[]>, string, unknown];
    for (const key of Object.keys(jcal[1] ?? {})) {
      if (key.toLowerCase() === "type") {
        prop.removeParameter(key);
      }
    }
    const [only] = adr.type;
    if (adr.type.length > 1) {
      prop.setParameter("type", adr.type);
    } else if (only !== undefined) {
      prop.setParameter("type", only);
    }
  }
}

/** Reconstruct a BDAY date string from year/month/day parts. */
function reconstructBdaySource(bday: EditableFields["bday"]): string {
  if (bday === null) return "";
  const { year, month, day } = bday;
  if (year !== null && month !== null && day !== null) {
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (month !== null && day !== null) {
    return `--${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (year !== null && month !== null) {
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  }
  if (year !== null) {
    return String(year);
  }
  return "";
}

/**
 * Update the first BDAY property in place from the structured parts. Other
 * BDAY properties remain untouched.
 */
function updateBdayProperty(raw: RawComponent, bday: EditableFields["bday"]): void {
  if (bday === null) return;

  // Parts the user did not change: leave the property exactly as parsed, so
  // text values, date-times and reduced dates keep their original form.
  const current = readBirthday(raw);
  if (
    current !== null &&
    current.year === bday.year &&
    current.month === bday.month &&
    current.day === bday.day
  ) {
    return;
  }

  let prop = raw.getFirstProperty("bday");

  const appleForm = writesAppleYearless(raw, bday);
  const dateStr = reconstructBdaySource(appleForm ? { ...bday, year: APPLE_NO_YEAR } : bday);
  if (dateStr.length === 0) {
    if (prop) raw.removeProperty(prop);
    return;
  }

  if (!prop) {
    prop = new ICAL.Property("bday");
    raw.addProperty(prop);
  }

  // Keep the time of day when the edited date has the same shape as the
  // original one. Otherwise the time is dropped on purpose: RFC 6350 has no
  // date-time form for a year-month or year-only date.
  const sourceDate = bday.source.replace(/T.*$/, "");
  const sourceTime = bday.source.slice(sourceDate.length);
  if (bday.valueType !== "text" && sourceTime.length > 0 && sourceDate.length === dateStr.length) {
    prop.setValue(dateStr + sourceTime);
  } else {
    const dateType = dateValueTypeOf(raw);
    const jcal = prop.toJSON() as [string, unknown, string, unknown];
    if (jcal[2] !== dateType) prop.resetType(dateType);
    prop.setValue(dateStr);
  }
  if (appleForm) prop.setParameter(APPLE_OMIT_YEAR, String(APPLE_NO_YEAR));
  else prop.removeParameter(APPLE_OMIT_YEAR);
}

// ---------------------------------------------------------------------------
// Apple's year-less birthday (ADR 028)
// ---------------------------------------------------------------------------

/** vCard 3.0 has no date without a year: Apple writes this one and names it in the parameter. */
const APPLE_NO_YEAR = 1604;
const APPLE_OMIT_YEAR = "x-apple-omit-year";

/**
 * The birthday's year, null when Apple's `X-APPLE-OMIT-YEAR` says it is only
 * a placeholder for a day and month.
 */
function appleOmittedYear(
  params: Record<string, string | string[]>,
  { year, month, day }: { year: number | null; month: number | null; day: number | null },
): number | null {
  const omitted = params[APPLE_OMIT_YEAR];
  const placeholder = typeof omitted === "string" && Number(omitted) === year;
  return placeholder && month !== null && day !== null ? null : year;
}

/** A day and month without a year, on a vCard 3.0 card: written as Apple writes it. */
function writesAppleYearless(
  raw: RawComponent,
  bday: NonNullable<EditableFields["bday"]>,
): boolean {
  return (
    raw.getFirstPropertyValue("version") !== "4.0" &&
    bday.year === null &&
    bday.month !== null &&
    bday.day !== null
  );
}

/** Value type for a date without time: RFC 6350 only allows date-and-or-time on BDAY. */
function dateValueTypeOf(raw: RawComponent): string {
  return raw.getFirstPropertyValue("version") === "4.0" ? "date-and-or-time" : "date";
}

/**
 * Update the first ORG property in place, replacing only the first component
 * (org name) and preserving any additional components (org units).
 */
function updateOrgProperty(raw: RawComponent, org: string): void {
  let prop = raw.getFirstProperty("org");
  if (org.length > 0) {
    if (!prop) {
      prop = new ICAL.Property("org");
      raw.addProperty(prop);
    }
    const existing = prop.getFirstValue();
    const parts = Array.isArray(existing) ? [...(existing as string[])] : [];
    parts[0] = org;
    prop.setValue(parts);
  } else if (prop) {
    // When clearing org name: keep the property if there are secondary components
    // (org units) beyond the first, preserving "Acme, Unit"
    const existing = prop.getFirstValue();
    const parts = Array.isArray(existing) ? [...(existing as string[])] : [];
    if (parts.length > 1) {
      parts[0] = "";
      prop.setValue(parts);
    } else {
      raw.removeProperty(prop);
    }
  }
}

// ---------------------------------------------------------------------------
// Read-only display accessors
// ---------------------------------------------------------------------------

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
function readOrg(raw: RawComponent): string {
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
function readTitle(raw: RawComponent): string {
  const value = raw.getFirstPropertyValue("title");
  return typeof value === "string" ? value : "";
}

/** The 7 structured parts of an ADR property, as a plain object. */
export type VCardAddress = {
  poBox: string;
  extended: string;
  street: string;
  locality: string;
  region: string;
  postalCode: string;
  country: string;
  /** TYPE parameter values (e.g. ["HOME"]) — used for the row label. */
  type: string[];
  /** Extra components beyond the standard 7 (e.g. formatted-address in
   *  some vCard 3.0 exports). These are always preserved as-is. */
  extraParts: string[];
  label?: string;
};

/** ADR parts of the first ADR property, or null when the card has none. */
export function addressOf(contact: Contact): VCardAddress | null {
  return readAddress(contact.raw);
}

/** @internal Read first ADR from a raw component. */
function readAddress(raw: RawComponent): VCardAddress | null {
  const prop = raw.getFirstProperty("adr");
  if (!prop) return null;
  const jcal = prop.toJSON() as [string, Record<string, string | string[]>, string, unknown];
  const rawParts = Array.isArray(prop.getFirstValue())
    ? (prop.getFirstValue() as unknown[]).map((part) => String(part ?? ""))
    : [];
  const rawParams = jcal[1] ?? {};
  const rawType = rawParams.TYPE ?? rawParams.type;
  const type = Array.isArray(rawType)
    ? rawType.map((v) => String(v))
    : typeof rawType === "string"
      ? [rawType]
      : [];
  return {
    poBox: rawParts[0] ?? "",
    extended: rawParts[1] ?? "",
    street: rawParts[2] ?? "",
    locality: rawParts[3] ?? "",
    region: rawParts[4] ?? "",
    postalCode: rawParts[5] ?? "",
    country: rawParts[6] ?? "",
    extraParts: rawParts.slice(7),
    type,
    ...(appleLabelOf(raw, prop) === undefined ? {} : { label: appleLabelOf(raw, prop) }),
  };
}

/** BDAY as plain date parts plus the raw stored text (used for copy). */
export type Birthday = {
  /** Raw property value as stored ("1987-03-14", "--03-14", "1987", …).
   *  This is the ical.js-normalised value, not the raw text from the vCard
   *  (ical.js may normalise "1987-3-14" to "1987-03-14"). */
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
function readBirthday(raw: RawComponent): Birthday | null {
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
    return { source, valueType, ...parts, year: appleOmittedYear(jcal[1], parts) };
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

/** @internal Read NOTE from a raw component. */
function readNote(raw: RawComponent): string {
  const value = raw.getFirstPropertyValue("note");
  return typeof value === "string" ? value : "";
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
    const value = String(prop.getFirstValue() ?? "").trim();
    if (value.length > 0) members.push(value.replace(/^urn:uuid:/i, ""));
  }
  return { name, members };
}

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

function versionOf(raw: RawComponent): "3.0" | "4.0" | null {
  const version = raw.getFirstPropertyValue("version");
  return version === "3.0" || version === "4.0" ? version : null;
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
function updatePhotoProperty(raw: RawComponent, photo: PhotoEdit): void {
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

// ---------------------------------------------------------------------------
// ical.js workarounds
// ---------------------------------------------------------------------------

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
function decodeEscapedSemicolons(): void {
  const values = ICAL.design.vcard.value as Record<string, ValueCodec | undefined>;
  for (const type of ["text", "uri"]) {
    const codec = values[type];
    if (!codec) throw new Error(`ical.js has no vCard ${type} value`);
    // Evaluated again (hot reload, tests), the module finds it done.
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
decodeEscapedSemicolons();

/**
 * ical.js's vCard 3.0 `detectType` types every BDAY as date/date-time and
 * drops `VALUE=text`, so a free-text birthday ("circa 1987") throws when
 * hydrated and is mangled when stringified. Retype such properties as text
 * so the card parses and the value round-trips. See DECISIONS.md 012.
 */
function retypeTextBirthdays(raw: RawComponent): void {
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
function unescapeDataUriSemicolons(raw: RawComponent): void {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse vCard text into a Contact.
 *
 * `href` and `etag` are optional — they default to `""` so callers that only
 * have the body text can still construct a Contact.
 */
export function parse(text: string, href = "", etag = ""): Contact {
  const jCal = ICAL.parse(text);
  const raw = new ICAL.Component(jCal);
  retypeTextBirthdays(raw);
  unescapeDataUriSemicolons(raw);

  const uid = readUid(raw) ?? "";

  // --- FN ---
  const fnValue = raw.getFirstPropertyValue("fn");
  const fn = String(fnValue ?? "");

  // --- N ---
  const nProp = raw.getFirstProperty("n");
  const n = nProp
    ? nValueToStruct(nProp.getFirstValue())
    : { family: "", given: "", additional: "", prefix: "", suffix: "" };

  // --- TEL ---
  const telProps = raw.getAllProperties("tel");
  const tel = telProps.map((prop) => labelledField(raw, prop));

  // --- EMAIL ---
  const emailProps = raw.getAllProperties("email");
  const email = emailProps.map((prop) => labelledField(raw, prop));

  const fields: EditableFields = {
    fn,
    n,
    tel,
    email,
    nickname: String(raw.getFirstPropertyValue("nickname") ?? ""),
    adr: readAddress(raw),
    bday: readBirthday(raw),
    org: readOrg(raw),
    title: readTitle(raw),
    url: String(raw.getFirstPropertyValue("url") ?? ""),
    ...(raw.getFirstProperty("url")
      ? { urlField: labelledField(raw, raw.getFirstProperty("url") as RawProperty) }
      : {}),
    note: readNote(raw),
    photo: { kind: "unchanged" },
  };

  return { href, etag, uid, fields, raw };
}

/** Properties the contact page shows every occurrence of, and the card's framing. */
const SHOWN_ALL = new Set([
  "tel",
  "email",
  "categories",
  // The photo control shows one and replaces them all (ADR 023).
  "photo",
  "version",
  "uid",
  "rev",
  "prodid",
]);

/** Properties the contact page reads once: a later occurrence isn't shown. */
const SHOWN_FIRST = new Set(["fn", "n", "nickname", "adr", "bday", "org", "title", "url", "note"]);

/**
 * The card's properties the contact page neither shows nor edits, each as
 * its vCard line, for whoever wants to look: a save writes them back as they
 * are. Read-only.
 */
export function unshownPropertiesOf(contact: Contact): string[] {
  const seen = new Set<string>();
  const labels = new Set<RawProperty>();
  for (const name of ["tel", "email", "adr", "url"]) {
    const properties = contact.raw.getAllProperties(name);
    for (const prop of name === "tel" || name === "email" ? properties : properties.slice(0, 1)) {
      if (appleLabelOf(contact.raw, prop) === undefined) continue;
      const label = appleLabelProperty(contact.raw, prop);
      if (label) labels.add(label);
    }
  }
  return (contact.raw as unknown as ICAL.Component)
    .getAllProperties()
    .filter((prop) => {
      const name = prop.name.toLowerCase();
      if (labels.has(prop)) return false;
      if (SHOWN_ALL.has(name)) return false;
      if (!SHOWN_FIRST.has(name) || seen.has(name)) return true;
      seen.add(name);
      return false;
    })
    .map((prop) => prop.toICALString());
}

/**
 * Takes `name` out of the contact's CATEGORIES (ADR 022): only that value
 * goes, a property left empty is dropped, and the other values, parameters
 * and group prefix stay. Mutates `raw`; true when something changed.
 */
export function removeCategory(contact: Contact, name: string): boolean {
  let changed = false;
  for (const prop of contact.raw.getAllProperties("categories")) {
    const values = prop.getValues();
    const kept = values.filter((value) => String(value).trim() !== name);
    if (kept.length === values.length) continue;
    changed = true;
    if (kept.length === 0) contact.raw.removeProperty(prop);
    else prop.setValues(kept);
  }
  return changed;
}

/** The member value for a UID: `urn:uuid:<UID>`, never doubling the prefix. */
function memberValue(uid: string): string {
  return /^urn:uuid:/i.test(uid) ? uid : `urn:uuid:${uid}`;
}

/** The member property a group card uses, else the one of its version. */
function memberPropertyOf(card: Contact): string {
  if (card.raw.getAllProperties("x-addressbookserver-member").length > 0) {
    return "x-addressbookserver-member";
  }
  if (card.raw.getAllProperties("member").length > 0) return "member";
  return String(card.raw.getFirstPropertyValue("version") ?? "") === "4.0"
    ? "member"
    : "x-addressbookserver-member";
}

/** Adds the UID to a group card's members, unless it is there. Mutates `raw`. */
export function addMember(card: Contact, uid: string): boolean {
  const bare = uid.trim().replace(/^urn:uuid:/i, "");
  if (groupCardOf(card).members.includes(bare)) return false;
  const prop = new ICAL.Property(memberPropertyOf(card));
  prop.setValue(memberValue(uid.trim()));
  card.raw.addProperty(prop);
  return true;
}

/** Removes every member line naming the UID from a group card. Mutates `raw`. */
export function removeMember(card: Contact, uid: string): boolean {
  const bare = uid.trim().replace(/^urn:uuid:/i, "");
  let changed = false;
  for (const name of ["member", "x-addressbookserver-member"]) {
    for (const prop of card.raw.getAllProperties(name)) {
      const value = String(prop.getFirstValue() ?? "")
        .trim()
        .replace(/^urn:uuid:/i, "");
      if (value === bare) {
        card.raw.removeProperty(prop);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * A new group card (ADR 022): vCard 3.0 with a fresh UID, `FN`, `N`,
 * `X-ADDRESSBOOKSERVER-KIND:group` and one member.
 */
export function newGroupCard(name: string, memberUid: string): Contact {
  const card = parse(
    ["BEGIN:VCARD", "VERSION:3.0", `UID:${randomUuid()}`, "END:VCARD", ""].join("\r\n"),
  );
  const fn = new ICAL.Property("fn");
  fn.setValue(name);
  card.raw.addProperty(fn);
  const n = new ICAL.Property("n");
  n.setValue([name, "", "", "", ""]);
  card.raw.addProperty(n);
  const kind = new ICAL.Property("x-addressbookserver-kind");
  kind.setValue("group");
  card.raw.addProperty(kind);
  addMember(card, memberUid);
  return parse(card.raw.toString());
}

/** A card's text, fields untouched, ended as RFC 6350 requires. */
export function serialiseRaw(contact: Contact): string {
  return cardText(contact.raw);
}

/**
 * The component's text with the line break after `END:VCARD` that RFC 6350
 * §3.3 requires, which ical.js leaves out.
 */
function cardText(raw: RawComponent): string {
  return `${raw.toString()}\r\n`;
}

/** Gives a contact without a UID a fresh one (ADR 022). Mutates `raw`. */
export function ensureUid(contact: Contact): Contact {
  if (contact.uid.trim().length > 0) return contact;
  const uid = randomUuid();
  // A blank UID line gets the value: a card has at most one UID.
  const existing = contact.raw.getFirstProperty("uid");
  if (existing) {
    existing.setValue(uid);
  } else {
    const prop = new ICAL.Property("uid");
    prop.setValue(uid);
    contact.raw.addProperty(prop);
  }
  return { ...contact, uid };
}

/**
 * A blank contact for the creation form: vCard 3.0 (ADR 008) with a fresh
 * UID, not yet on the server (empty href and ETag).
 */
export function newContact(): Contact {
  return parse(["BEGIN:VCARD", "VERSION:3.0", `UID:${randomUuid()}`, "END:VCARD", ""].join("\r\n"));
}

/**
 * A random v4 UUID. getRandomValues, unlike randomUUID, also exists outside
 * secure contexts, e.g. a Natel served over plain HTTP on a LAN.
 */
function randomUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The cards of a .vcf file, each as its exact text from `BEGIN:VCARD` to its
 * `END:VCARD`, line endings as in the file (ADR 020: the original text is
 * what an import sends). A byte order mark and anything between cards are
 * dropped. A card missing its `END:VCARD` ends where the next card begins,
 * and is kept as it is for the parser to reject; only a vCard 2.1 `AGENT`
 * nests a card inside another.
 */
export function splitCards(fileText: string): string[] {
  const lines = fileText.replace(/^\uFEFF/, "").match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  const cards: string[] = [];
  let current: string[] = [];
  let depth = 0;
  let previous = "";
  for (const line of lines) {
    if (line.length === 0) continue;
    const content = line.trimEnd().toUpperCase();
    if (content === "BEGIN:VCARD") {
      if (depth > 0 && !/^(?:[\w-]+\.)?AGENT[;:]/.test(previous)) {
        cards.push(current.join(""));
        current = [];
        depth = 0;
      }
      depth += 1;
    }
    previous = content;
    if (depth > 0) current.push(line);
    if (content === "END:VCARD" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        cards.push(current.join(""));
        current = [];
      }
    }
  }
  if (current.length > 0) cards.push(current.join(""));
  return cards;
}

/**
 * What an import needs to know of a card: its UID as parse reads it (null
 * when it has none), and a name to report it by. Throws when ical.js can't
 * read it as a vCard.
 */
export function readImportCard(cardText: string): { uid: string | null; name: string } {
  const jCal = ICAL.parse(cardText);
  if (!Array.isArray(jCal) || jCal[0] !== "vcard") throw new Error("not a vCard");
  const raw = new ICAL.Component(jCal as unknown[]);
  const uid = readUid(raw);
  const fn = String(raw.getFirstPropertyValue("fn") ?? "").trim();
  const n = raw.getFirstProperty("n");
  const parts = n ? nValueToStruct(n.getFirstValue()) : null;
  const name = fn || [parts?.given, parts?.family].filter(Boolean).join(" ");
  return { uid, name };
}

/**
 * A card's UID as ical.js reads it (unescaped), null without one. Shared by
 * parse and the import, so both sides of ADR 020's exact comparison match.
 */
function readUid(raw: RawComponent): string | null {
  const prop = raw.getFirstProperty("uid");
  return prop ? String(prop.getFirstValue() ?? "") : null;
}

/**
 * A card text given a `UID:` line just before its `END:VCARD`, in the card's
 * own line ending, the value escaped as vCard text. Nothing else of the text
 * changes.
 */
export function withUid(cardText: string, uid: string): string {
  const eol = /\r\n|\n|\r/.exec(cardText)?.[0] ?? "\r\n";
  const end = cardText.search(/END:VCARD[ \t]*(?:\r\n|\n|\r)?$/i);
  if (end === -1) return cardText;
  const value = uid
    .replace(/[\\,;]/g, (char) => `\\${char}`)
    .replace(/\r?\n/g, "\\n")
    .replace(/\r/g, "");
  return `${cardText.slice(0, end)}UID:${value}${eol}${cardText.slice(end)}`;
}

/** A fresh random UID, as newContact gives a new card. */
export function newUid(): string {
  return randomUuid();
}

/**
 * Serialise a Contact back to vCard text.
 *
 * Applies the editable fields onto `contact.raw`, then serialises the full
 * component. Properties the UI never touches are emitted exactly as parsed.
 */
export function serialise(contact: Contact): string {
  const { raw, fields } = contact;

  for (const field of [...fields.tel, ...fields.email]) {
    if (field.dropLabel) dropAppleLabel(raw, field.params?.group ?? field.params?.GROUP);
  }
  if (fields.adr?.dropLabel) {
    const prop = raw.getFirstProperty("adr");
    if (prop) dropAppleLabel(raw, groupOf(prop));
  }
  if (fields.urlField?.dropLabel) {
    const prop = raw.getFirstProperty("url");
    if (prop) dropAppleLabel(raw, groupOf(prop));
  }

  // --- Update FN ---
  let fnProp = raw.getFirstProperty("fn");
  if (!fnProp) {
    const prop = new ICAL.Property("fn");
    raw.addProperty(prop);
    fnProp = prop;
  }
  fnProp.setValue(fields.fn);

  // --- Update N ---
  let nProp = raw.getFirstProperty("n");
  if (!nProp) {
    const prop = new ICAL.Property("n");
    raw.addProperty(prop);
    nProp = prop;
  }
  nProp.setValue([
    fields.n.family,
    fields.n.given,
    fields.n.additional,
    fields.n.prefix,
    fields.n.suffix,
  ]);

  // --- Update TEL properties in place ---
  replacePropertiesInPlace(raw, "tel", fields.tel);

  // --- Update EMAIL properties in place ---
  replacePropertiesInPlace(raw, "email", fields.email);

  // --- Update NICKNAME ---
  updateStringProperty(raw, "nickname", fields.nickname);

  // --- Update ADR (first property only) ---
  updateAddressProperty(raw, fields.adr);

  // --- Update BDAY (first property only) ---
  updateBdayProperty(raw, fields.bday);

  // --- Update ORG (first property only, first component) ---
  updateOrgProperty(raw, fields.org);

  // --- Update TITLE ---
  updateStringProperty(raw, "title", fields.title);

  // --- Update URL (first property only) ---
  const url = raw.getFirstProperty("url");
  updateFirstStringProperty(raw, "url", fields.url);
  const editedUrl = url
    ? raw.getAllProperties("url").includes(url)
      ? url
      : null
    : raw.getFirstProperty("url");
  if (editedUrl && fields.urlField) {
    const params = fields.urlField.params ?? {};
    const type = params.type ?? params.TYPE;
    const current = propertyToField(editedUrl).params ?? {};
    if (JSON.stringify(type) !== JSON.stringify(current.type ?? current.TYPE)) {
      for (const key of ["type", "TYPE"]) editedUrl.removeParameter(key);
      if (type !== undefined) editedUrl.setParameter("type", type);
    }
  }

  // --- Update NOTE (first property only) ---
  updateFirstStringProperty(raw, "note", fields.note);

  // --- Update PHOTO, only when replaced or removed ---
  updatePhotoProperty(raw, fields.photo);

  // The saved Contact is also the query cache's value.
  fields.tel = raw.getAllProperties("tel").map((prop) => labelledField(raw, prop));
  fields.email = raw.getAllProperties("email").map((prop) => labelledField(raw, prop));
  fields.adr = readAddress(raw);
  const savedUrl = raw.getFirstProperty("url");
  fields.urlField = savedUrl ? labelledField(raw, savedUrl) : undefined;
  fields.url = String(raw.getFirstPropertyValue("url") ?? "");

  return cardText(raw);
}
