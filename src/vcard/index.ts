/**
 * vCard parse/serialise.
 *
 * The ONLY module that imports ical.js. UI code imports parse/serialise from
 * here, never from ical.js directly.
 */

import ICAL from "ical.js";
import type { Contact, ContactField, EditableFields, RawProperty } from "../model/contact";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert a 5-element N structured value to our model struct. */
function nValueToStruct(value: unknown): EditableFields["n"] {
  const arr = Array.isArray(value) ? (value as string[]) : ["", "", "", "", ""];
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
  const fnProp = raw.getFirstProperty("fn");
  if (fnProp) {
    fnProp.setValue(fields.fn);
  }

  // --- Update N ---
  const nProp = raw.getFirstProperty("n");
  if (nProp) {
    nProp.setValue([
      fields.n.family,
      fields.n.given,
      fields.n.additional,
      fields.n.prefix,
      fields.n.suffix,
    ]);
  }

  // --- Replace all TEL properties ---
  raw.removeAllProperties("tel");
  for (const telField of fields.tel) {
    raw.addProperty(fieldToProperty("tel", telField));
  }

  // --- Replace all EMAIL properties ---
  raw.removeAllProperties("email");
  for (const emailField of fields.email) {
    raw.addProperty(fieldToProperty("email", emailField));
  }

  return raw.toString();
}
