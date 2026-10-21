/**
 * Writes the edited subset back onto the card's own properties, in place:
 * text properties, name, addresses, birthday and organisation.
 */

import ICAL from "ical.js";
import type {
  EditableFields,
  RawComponent,
  RawProperty,
  VCardAddressField,
} from "../model/contact";
import {
  APPLE_NO_YEAR,
  APPLE_OMIT_YEAR,
  dateValueTypeOf,
  writesAppleYearless,
} from "./apple-birthday";
import {
  addressCodesOf,
  appleLabelOf,
  componentText,
  dropAppleLabel,
  groupOf,
  moveToFreeGroup,
  N_KEYS,
  setAppleLabel,
  sharesLabel,
} from "./fields";
import { addressPartsOf, addressTypesOf, readBirthday, structuredValue } from "./read";

/**
 * Update or remove a single-string property (NICKNAME, TITLE).
 * Preserves multi-values beyond the first (NICKNAME:Jean,Petit stays intact)
 * when the property supports it (ical.js multi-value types).
 */
export function updateStringProperty(raw: RawComponent, name: string, value: string): void {
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
export function updateFirstStringProperty(raw: RawComponent, name: string, value: string): void {
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
 * A structured value's parts as edited, where each part still as read keeps
 * its parsed value, so a list stays a list.
 */
function keepUneditedParts(
  parsed: unknown[],
  read: readonly string[],
  edited: readonly string[],
): unknown[] {
  return edited.map((part, i) => (read[i] === part ? (parsed[i] ?? part) : part));
}

/**
 * Update the N property in place, leaving it untouched when no component
 * changed. Components past the fifth (RFC 9554 adds two) stay as they are.
 */
export function updateNameProperty(raw: RawComponent, n: EditableFields["n"]): void {
  const edited = N_KEYS.map((key) => n[key]);
  const prop = raw.getFirstProperty("n");
  if (!prop) {
    const added = new ICAL.Property("n");
    added.setValue(edited);
    raw.addProperty(added);
    return;
  }
  const value = prop.getFirstValue();
  const parsed: unknown[] = Array.isArray(value) ? value : [value];
  const read = parsed.map(componentText);
  if (edited.every((part, i) => part === (read[i] ?? ""))) return;
  prop.setValue(keepUneditedParts(parsed, read, [...edited, ...read.slice(N_KEYS.length)]));
}

/**
 * Writes the edited addresses onto the card's ADR properties. Each address
 * goes back on the property it was read from, found by its value and
 * parameters whatever its group, so it keeps that property's group, label
 * and X-ABADR (ADR 036). One changed elsewhere since (ADR 013) takes the
 * property left in its group if that group's X-ABADR is unchanged, any other
 * gets a new one, and the rest go.
 */
export function updateAddressProperties(raw: RawComponent, adrs: VCardAddressField[]): void {
  const kept = adrs.filter(writesAddress);
  const unclaimed = raw.getAllProperties("adr");
  const claim = (match: (prop: RawProperty) => boolean) => {
    const i = unclaimed.findIndex(match);
    return i >= 0 ? unclaimed.splice(i, 1)[0] : undefined;
  };
  // Every address looks where it was read before any looks further.
  const found: (RawProperty | undefined)[] = [];
  for (const groups of [SAME_GROUP, SAME_GROUPING, ANY_GROUP]) {
    kept.forEach((adr, i) => {
      found[i] ??= claim((p) => isReadFrom(p, adr, groups));
    });
  }
  // One changed elsewhere since it was read takes what is left in its group,
  // if the group still holds the X-ABADR it was read with: what is left, there
  // or elsewhere, may be another address's, regrouped, added elsewhere or
  // removed by the user.
  kept.forEach((adr, i) => {
    const group = adr.source && sourceGroupOf(adr.source.params);
    const codes = JSON.stringify(adr.source?.abadr ?? []);
    if (group === undefined || JSON.stringify(addressCodesOf(raw, group)) !== codes) return;
    found[i] ??= claim((p) => groupOf(p) === group);
  });
  const placed = kept.map((adr, i): [RawProperty, VCardAddressField] => {
    let prop = found[i];
    if (prop === undefined) {
      prop = new ICAL.Property("adr");
      raw.addProperty(prop);
    }
    return [prop, adr];
  });
  for (const prop of unclaimed) raw.removeProperty(prop);
  // An overwrite can add one before the card's own: the list keeps its order.
  const order = raw.getAllProperties("adr");
  if (placed.some(([prop], i) => order[i] !== prop)) {
    for (const [prop] of placed) {
      raw.removeProperty(prop);
      raw.addProperty(prop);
    }
  }
  for (const [prop, adr] of placed) writeAddress(prop, adr);
  for (const [prop, adr] of placed) writeAddressLabel(raw, prop, adr);
}

/** Whether a property's group fits the group an address was read in. */
type GroupMatch = (read: string | undefined, now: string | undefined) => boolean;
const SAME_GROUP: GroupMatch = (read, now) => read === now;
/** Another group for one read in a group, still none for one read without. */
const SAME_GROUPING: GroupMatch = (read, now) => (read === undefined) === (now === undefined);
const ANY_GROUP: GroupMatch = () => true;

function isReadFrom(prop: RawProperty, adr: VCardAddressField, groups: GroupMatch): boolean {
  if (adr.source === undefined) return false;
  const [, params] = prop.toJSON() as [string, Record<string, string | string[]>];
  return (
    groups(sourceGroupOf(adr.source.params), groupOf(prop)) &&
    JSON.stringify(prop.getFirstValue()) === JSON.stringify(adr.source.value) &&
    JSON.stringify(withoutGroup(params)) === JSON.stringify(withoutGroup(adr.source.params))
  );
}

function sourceGroupOf(params: Record<string, string | string[]>): string | undefined {
  const group = params.group ?? params.GROUP;
  return typeof group === "string" && group.length > 0 ? group.toLowerCase() : undefined;
}

function withoutGroup(params: Record<string, string | string[]>) {
  const { group: _g, GROUP: _G, ...rest } = params;
  return rest;
}

/** False for an address the user emptied, or a new one left blank: a save drops it. */
export function writesAddress(adr: VCardAddressField): boolean {
  const parts = editedParts(adr);
  if (parts.some((part) => part.length > 0)) return true;
  return adr.source !== undefined && sameParts(addressPartsOf(adr.source.value), parts);
}

/**
 * Puts `adr` on `prop`: the parameters and value it was read with, then
 * what the user changed. Only the parts and TYPE edited are
 * rewritten, so untouched components (including list values like
 * "Rue A,Bât B") and parameter order survive.
 */
function writeAddress(prop: RawProperty, adr: VCardAddressField): void {
  const read = adr.source === undefined ? [] : addressPartsOf(adr.source.value);
  const edited = editedParts(adr);
  const params = withoutGroup(adr.source?.params ?? {});
  if (!sameParts(addressTypesOf(params), adr.type)) {
    delete params.type;
    delete params.TYPE;
    const [only] = adr.type;
    if (adr.type.length > 1) params.type = adr.type;
    else if (only !== undefined) params.type = only;
  }
  const value =
    adr.source !== undefined && sameParts(read, edited)
      ? adr.source.value
      : keepUneditedParts(structuredValue(adr.source?.value), read, edited);

  const jcal = prop.toJSON() as [string, Record<string, string | string[]>, string, unknown];
  const current = jcal[1] ?? {};
  for (const key of Object.keys(current)) {
    if (!(key in params) && key.toLowerCase() !== "group") prop.removeParameter(key);
  }
  for (const [key, param] of Object.entries(params)) {
    if (JSON.stringify(current[key]) !== JSON.stringify(param)) prop.setParameter(key, param);
  }
  if (JSON.stringify(prop.getFirstValue()) !== JSON.stringify(value)) prop.setValue(value);
}

/**
 * Gives the address the label it is saved with. A group shared with another
 * property keeps its label: the address moves out of it instead.
 */
function writeAddressLabel(raw: RawComponent, prop: RawProperty, adr: VCardAddressField): void {
  const label = savedLabelOf(adr);
  if (appleLabelOf(raw, prop) === label) return;
  if (label !== undefined) setAppleLabel(raw, prop, label);
  else if (sharesLabel(raw, prop)) moveToFreeGroup(raw, prop);
  else dropAppleLabel(raw, groupOf(prop));
}

/** The label an address is saved with: one being typed, else the card's unless a type replaces it. */
export function savedLabelOf(adr: VCardAddressField): string | undefined {
  const custom = adr.customLabel?.trim();
  if (custom !== undefined) return custom.length > 0 ? custom : undefined;
  return adr.dropLabel ? undefined : adr.label;
}

function editedParts(adr: VCardAddressField): string[] {
  return [
    adr.poBox,
    adr.extended,
    adr.street,
    adr.locality,
    adr.region,
    adr.postalCode,
    adr.country,
    ...adr.extraParts,
  ];
}

function sameParts(a: readonly string[], b: readonly string[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
export function updateBdayProperty(raw: RawComponent, bday: EditableFields["bday"]): void {
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

/**
 * Update the first ORG property in place, replacing only the first component
 * (org name) and preserving any additional components (org units).
 */
export function updateOrgProperty(raw: RawComponent, org: string): void {
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
