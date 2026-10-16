/**
 * Apple's year-less birthday (ADR 028): read and written as Apple does.
 */

import type { EditableFields, RawComponent } from "../model/contact";

/** vCard 3.0 has no date without a year: Apple writes this one and names it in the parameter. */
export const APPLE_NO_YEAR = 1604;
export const APPLE_OMIT_YEAR = "x-apple-omit-year";

/**
 * The birthday's year, null when Apple's `X-APPLE-OMIT-YEAR` says it is only
 * a placeholder for a day and month.
 */
export function appleOmittedYear(
  params: Record<string, string | string[]>,
  { year, month, day }: { year: number | null; month: number | null; day: number | null },
): number | null {
  const omitted = params[APPLE_OMIT_YEAR];
  const placeholder = typeof omitted === "string" && Number(omitted) === year;
  return placeholder && month !== null && day !== null ? null : year;
}

/** A day and month without a year, on a vCard 3.0 card: written as Apple writes it. */
export function writesAppleYearless(
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
export function dateValueTypeOf(raw: RawComponent): string {
  return raw.getFirstPropertyValue("version") === "4.0" ? "date-and-or-time" : "date";
}
