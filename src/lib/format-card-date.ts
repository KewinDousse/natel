/**
 * Display of the dates a card records about itself (`REV`, `CREATED`), in the
 * current locale.
 */

import type { CardDate } from "@/vcard";
import { isoDay } from "./iso-day";

/** The day alone, "12 novembre 2026" / "November 12, 2026". */
export function formatCardDate(value: CardDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(
    value.date,
  );
}

/** dateTime attribute for <time>: the instant, or the local day for a date alone. */
export function cardDateTime({ date, hasTime }: CardDate): string {
  return hasTime
    ? date.toISOString()
    : isoDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
}
