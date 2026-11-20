/**
 * Display of the dates a card records about itself (`REV`, `CREATED`), in the
 * current locale.
 */

import type { CardDate } from "@/vcard";
import { isoDay } from "./iso-day";

const FORMATS = {
  long: { year: "numeric", month: "long", day: "numeric" },
  thisYear: { month: "short", day: "numeric" },
  earlier: { month: "short", year: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

// A list sorted by revision formats every row: building a formatter costs more than using one.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, format: keyof typeof FORMATS): Intl.DateTimeFormat {
  const key = `${locale} ${format}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, FORMATS[format]);
    formatters.set(key, cached);
  }
  return cached;
}

/** The day alone, "12 novembre 2026" / "November 12, 2026". */
export function formatCardDate(value: CardDate, locale: string): string {
  return formatter(locale, "long").format(value.date);
}

/** dateTime attribute for <time>: the instant, or the local day for a date alone. */
export function cardDateTime({ date, hasTime }: CardDate): string {
  return hasTime
    ? date.toISOString()
    : isoDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * The day in a list row: "12 nov." / "Nov 12" this year, the month and year
 * before, "nov. 2024" / "Nov 2024", which keeps the column narrow.
 */
export function formatShortCardDate(value: CardDate, locale: string, now: Date): string {
  const format = value.date.getFullYear() === now.getFullYear() ? "thisYear" : "earlier";
  return formatter(locale, format).format(value.date);
}
