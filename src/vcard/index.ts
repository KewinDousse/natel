/**
 * vCard parse/serialise.
 *
 * The ONLY module that imports ical.js. UI code imports parse/serialise from
 * here, never from ical.js directly.
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

  const fields: EditableFields = { fn, n, tel, email };

  return { href, etag, uid, fields, raw };
}

/**
 * Serialise a Contact back to vCard text.
 *
 * Applies the editable fields (FN, N, TEL, EMAIL) onto `contact.raw`, then
 * serialises the full component. Properties the UI never touches are emitted
 * exactly as parsed.
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

  return raw.toString();
}
