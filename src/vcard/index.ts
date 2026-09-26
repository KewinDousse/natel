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

  const dateStr = reconstructBdaySource(bday);
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
    return;
  }

  const dateType = dateValueTypeOf(raw);
  const jcal = prop.toJSON() as [string, unknown, string, unknown];
  if (jcal[2] !== dateType) prop.resetType(dateType);
  prop.setValue(dateStr);
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
    return {
      source,
      valueType,
      year: typeof t.year === "number" ? t.year : null,
      month: typeof t.month === "number" ? t.month : null,
      day: typeof t.day === "number" ? t.day : null,
    };
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
      if (typeof value === "string" && value.length > 0) groups.push(value);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// ical.js workarounds
// ---------------------------------------------------------------------------

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

  const uid = String(raw.getFirstPropertyValue("uid") ?? "");

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
  const tel = telProps.map(propertyToField);

  // --- EMAIL ---
  const emailProps = raw.getAllProperties("email");
  const email = emailProps.map(propertyToField);

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
    note: readNote(raw),
  };

  return { href, etag, uid, fields, raw };
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
 * Serialise a Contact back to vCard text.
 *
 * Applies the editable fields onto `contact.raw`, then serialises the full
 * component. Properties the UI never touches are emitted exactly as parsed.
 */
export function serialise(contact: Contact): string {
  const { raw, fields } = contact;

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
  updateFirstStringProperty(raw, "url", fields.url);

  // --- Update NOTE (first property only) ---
  updateFirstStringProperty(raw, "note", fields.note);

  return raw.toString();
}
