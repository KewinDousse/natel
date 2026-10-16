/**
 * Writes the edited subset back onto the card's own properties, in place:
 * text properties, address, birthday and organisation.
 */

import ICAL from "ical.js";
import type { EditableFields, RawComponent, RawProperty } from "../model/contact";
import {
  APPLE_NO_YEAR,
  APPLE_OMIT_YEAR,
  dateValueTypeOf,
  writesAppleYearless,
} from "./apple-birthday";
import { readAddress, readBirthday } from "./read";

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
 * Update the first ADR property in place. Only the parts and TYPE the user
 * changed are rewritten, so untouched components (including list values like
 * "Rue A,Bât B") and parameter order survive. Other ADR properties remain
 * untouched.
 */
export function updateAddressProperty(raw: RawComponent, adr: EditableFields["adr"]): void {
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
