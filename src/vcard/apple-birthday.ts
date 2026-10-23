/**
 * Apple's year-less birthday (ADRs 028 and 039).
 */

import type { EditableFields, RawComponent } from "../model/contact";

/** vCard 3.0 has no date without a year: Apple writes this one and names it in the parameter. */
export const APPLE_NO_YEAR = 1604;
export const APPLE_OMIT_YEAR = "x-apple-omit-year";

/** Apple's placeholder reads without a year; a partial date keeps its year. */
export function appleOmittedYear(
  raw: RawComponent,
  params: Record<string, string | string[]>,
  { year, month, day }: { year: number | null; month: number | null; day: number | null },
): number | null {
  if (month === null || day === null) return year;

  const omitted = params[APPLE_OMIT_YEAR];
  if (typeof omitted === "string" && Number(omitted) === year) return null;

  if (
    omitted !== undefined ||
    year !== APPLE_NO_YEAR ||
    raw.getFirstPropertyValue("version") !== "3.0"
  ) {
    return year;
  }

  const property = raw.getFirstProperty("prodid")?.toJSON();
  const prodid: unknown =
    Array.isArray(property) && property[2] === "text" ? property[3] : undefined;
  return typeof prodid === "string" && /^-\/\/Apple Inc\.\/\/iOS \d+(?:\.\d+)*\/\/EN$/.test(prodid)
    ? null
    : year;
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
