/**
 * Birthday display formatting.
 *
 * Takes the structured BDAY from src/vcard and formats it with Intl in the
 * current locale, so month names come out translated. Partial dates (year
 * only, or month-day without year) format gracefully; nothing here can
 * produce an Invalid Date.
 */

import type { Birthday } from "@/vcard";
import { isoDay } from "./iso-day";

/** Local midnight on the given date. `new Date(year, …)` reads a year from 0 to 99 as 1900 + year. */
function dateOf(year: number, monthIndex: number, day: number): Date {
  const date = new Date(2000, 0, 1);
  date.setFullYear(year, monthIndex, day);
  return date;
}

/**
 * Format a structured birthday for display:
 * - full date → "14 mars 1987" / "March 14, 1987"
 * - month-day → "14 mars" / "March 14" (no year)
 * - year-month → "mars 1987" / "March 1987"
 * - year only → "1987"
 * - a year below 1, which Intl prints as another year → the stored date, without its time
 * - anything unrecognisable → the raw stored text, untouched.
 */
export function formatBirthday(birthday: Birthday, locale: string): string {
  const { year, month, day, source } = birthday;
  if (year !== null && year < 1) return source.replace(/T.*$/, "");
  if (year !== null && month !== null && day !== null) {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(dateOf(year, month - 1, day));
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
    }).format(dateOf(year, month - 1, 1));
  }
  if (year !== null) {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
    }).format(dateOf(year, 0, 1));
  }
  return source;
}

/**
 * The age a full birthday gives on `today`, or null without a year or a day,
 * before a first birthday, or past any human age (a placeholder year another
 * client stored). Born on 29 February, a person turns a year older on
 * 1 March in a common year.
 */
export function ageOf(birthday: Birthday, today: Date): number | null {
  const { year, month, day } = birthday;
  if (year === null || month === null || day === null) return null;
  const thisMonth = today.getMonth() + 1;
  const hadBirthday = thisMonth > month || (thisMonth === month && today.getDate() >= day);
  const age = today.getFullYear() - year - (hadBirthday ? 0 : 1);
  return age >= 1 && age <= 130 ? age : null;
}

/** dateTime attribute for <time>: "1987-03-14", "--03-14" or "1987". */
export function birthdayDateTime(birthday: Birthday): string {
  const { year, month, day } = birthday;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (year !== null && month !== null && day !== null) return isoDay(year, month, day);
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
