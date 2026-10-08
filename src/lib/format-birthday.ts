/**
 * Birthday display formatting.
 *
 * Takes the structured BDAY from src/vcard and formats it with Intl in the
 * current locale, so month names come out translated. Partial dates (year
 * only, or month-day without year) format gracefully; nothing here can
 * produce an Invalid Date.
 */

import type { Birthday } from "@/vcard";

/**
 * Format a structured birthday for display:
 * - full date → "14 mars 1987" / "March 14, 1987"
 * - month-day → "14 mars" / "March 14" (no year)
 * - year-month → "mars 1987" / "March 1987"
 * - year only → "1987"
 * - anything unrecognisable → the raw stored text, untouched.
 */
export function formatBirthday(birthday: Birthday, locale: string): string {
  const { year, month, day, source } = birthday;
  if (year !== null && month !== null && day !== null) {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(year, month - 1, day));
  }
  if (month !== null && day !== null) {
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      day: "numeric",
    }).format(new Date(2000, month - 1, day));
  }
  if (year !== null && month !== null) {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
    }).format(new Date(year, month - 1, 1));
  }
  if (year !== null) {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
    }).format(new Date(year, 0, 1));
  }
  return source;
}

/** dateTime attribute for <time>: "1987-03-14", "--03-14" or "1987". */
export function birthdayDateTime(birthday: Birthday): string {
  const { year, month, day } = birthday;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (year !== null && month !== null && day !== null) {
    return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
  }
  if (month !== null && day !== null) return `--${pad(month)}-${pad(day)}`;
  if (year !== null) return String(year);
  return birthday.source;
}

/**
 * The text "Copier la date" puts on the clipboard: the stored value, except
 * that a day and month without a year come as `--MM-DD`, so the placeholder
 * year Apple stores (`X-APPLE-OMIT-YEAR`, ADR 028) isn't copied.
 */
export function birthdayCopyText(birthday: Birthday): string {
  const { year, month, day, source } = birthday;
  return year === null && month !== null && day !== null ? birthdayDateTime(birthday) : source;
}
