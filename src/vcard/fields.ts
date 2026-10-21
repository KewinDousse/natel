/**
 * Helpers the reading and writing code share: a property to and from the
 * model's fields, Apple's grouped labels (X-ABLABEL), in-place updates that
 * keep a property where it was, and the card's version.
 */

import ICAL from "ical.js";
import type { ContactField, EditableFields, RawComponent, RawProperty } from "../model/contact";

/** N's components in RFC 6350 order. */
export const N_KEYS = ["family", "given", "additional", "prefix", "suffix"] as const;

/**
 * A component of a structured value as text. A component can hold several
 * values (`N:Test;Alice,Alix;;;`, RFC 6350 §6.2.2), which ical.js reads as
 * an array: they read as one text, "Alice, Alix".
 */
export function componentText(part: unknown): string {
  return Array.isArray(part)
    ? part.map((value) => String(value ?? "")).join(", ")
    : String(part ?? "");
}

/** Convert a 5-element N structured value to our model struct. */
export function nValueToStruct(value: unknown): EditableFields["n"] {
  const arr: unknown[] = Array.isArray(value) ? value : [String(value)];
  return Object.fromEntries(
    N_KEYS.map((key, i) => [key, componentText(arr[i])]),
  ) as EditableFields["n"];
}

/** Convert a RawProperty to a ContactField. */
export function propertyToField(prop: RawProperty): ContactField {
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

export function groupOf(prop: RawProperty): string | undefined {
  const params = (prop.toJSON() as [string, Record<string, string | string[]>])[1];
  const group = params.group ?? params.GROUP;
  return typeof group === "string" && group.length > 0 ? group.toLowerCase() : undefined;
}

export function appleLabelProperty(raw: RawComponent, prop: RawProperty): RawProperty | undefined {
  const group = groupOf(prop);
  if (group === undefined) return undefined;
  return raw.getAllProperties("x-ablabel").find((label) => {
    const value = label.getFirstValue();
    return groupOf(label) === group && typeof value === "string" && value.length > 0;
  });
}

export function appleLabelOf(raw: RawComponent, prop: RawProperty): string | undefined {
  const value = appleLabelProperty(raw, prop)?.getFirstValue();
  return typeof value === "string" && value.length > 0 ? unescapeLabel(value) : undefined;
}

/**
 * ical.js keeps an `X-` value as written, escapes included: a label is
 * vCard text (RFC 6350 §3.4), so it is read and written as such.
 */
function unescapeLabel(value: string): string {
  return value.replace(/\\([\\,;nN])/g, (_, char: string) =>
    char === "n" || char === "N" ? "\n" : char,
  );
}

function escapeLabel(text: string): string {
  return text.replace(/[\\,;]/g, (char) => `\\${char}`).replace(/\r?\n/g, "\\n");
}

export function labelledField(raw: RawComponent, prop: RawProperty): ContactField {
  const field = propertyToField(prop);
  const label = appleLabelOf(raw, prop);
  return label === undefined ? field : { ...field, label };
}

export function dropAppleLabel(raw: RawComponent, group: string | string[] | undefined): void {
  if (typeof group !== "string" || group.length === 0) return;
  for (const prop of raw.getAllProperties("x-ablabel")) {
    if (groupOf(prop) === group.toLowerCase()) raw.removeProperty(prop);
  }
}

/**
 * Gives `prop` the label `text` (ADR 036): the `X-ABLABEL` of its group, in
 * a group of its own when it has none, or shares it with another property,
 * whose label would change too.
 */
export function setAppleLabel(raw: RawComponent, prop: RawProperty, text: string): void {
  if (appleLabelOf(raw, prop) === text) return;
  let group = groupOf(prop);
  if (group === undefined || sharesLabel(raw, prop)) group = moveToFreeGroup(raw, prop);
  const current =
    appleLabelProperty(raw, prop) ??
    raw.getAllProperties("x-ablabel").find((label) => groupOf(label) === group);
  if (current !== undefined) {
    current.setValue(escapeLabel(text));
    return;
  }
  const label = new ICAL.Property("x-ablabel");
  label.setParameter("group", group);
  label.setValue(escapeLabel(text));
  raw.addProperty(label);
}

/** Apple's companion of an address in its group: it goes where the address goes. */
const ADDRESS_COMPANION = "x-abadr";

/** The `X-ABADR` values of a group, as written. */
export function addressCodesOf(raw: RawComponent, group: string | undefined): string[] {
  if (group === undefined) return [];
  return raw
    .getAllProperties(ADDRESS_COMPANION)
    .filter((prop) => groupOf(prop) === group)
    .map((prop) => String(prop.getFirstValue() ?? ""));
}

/**
 * True when another property shares `prop`'s group, and so its label:
 * shown or not (`IMPP`, `X-ABRELATEDNAMES`…), it keeps that label.
 */
export function sharesLabel(raw: RawComponent, prop: RawProperty): boolean {
  const group = groupOf(prop);
  if (group === undefined) return false;
  const isAddress = prop.name === "adr";
  return raw.getAllProperties().some((other) => {
    if (other === prop || groupOf(other) !== group || other.name === "x-ablabel") return false;
    return !(isAddress && other.name === ADDRESS_COMPANION);
  });
}

/**
 * Moves `prop` to a group no other property uses, with an address's
 * companions when no other address is left to own them. Returns the group.
 */
export function moveToFreeGroup(raw: RawComponent, prop: RawProperty): string {
  const from = groupOf(prop);
  const to = freeGroup(raw);
  prop.setParameter("group", to);
  if (from === undefined || prop.name !== "adr") return to;
  if (raw.getAllProperties("adr").some((other) => groupOf(other) === from)) return to;
  for (const companion of raw.getAllProperties()) {
    if (groupOf(companion) === from && companion.name === ADDRESS_COMPANION) {
      companion.setParameter("group", to);
    }
  }
  return to;
}

/** The first `itemN` group no property of the card uses, as Apple names them. */
function freeGroup(raw: RawComponent): string {
  const used = new Set(raw.getAllProperties().map(groupOf));
  let n = 1;
  while (used.has(`item${n}`)) n++;
  return `item${n}`;
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
export function replacePropertiesInPlace(
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

export function versionOf(raw: RawComponent): "3.0" | "4.0" | null {
  const version = raw.getFirstPropertyValue("version");
  return version === "3.0" || version === "4.0" ? version : null;
}
