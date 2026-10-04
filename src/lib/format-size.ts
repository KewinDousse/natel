/**
 * A size in MB with one decimal, in the locale's words ("6,7 Mo", "6.7 MB").
 * The value is in MiB under the "MB" label on purpose: servers count their
 * limits that way (nginx's `1m` is 1,048,576 bytes), so the user can compare.
 */
export function formatMegabytes(bytes: number, locale: string): string {
  // Rounded up: a card just over a 1 MB limit must not read as "1 MB".
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1,
  }).format(Math.ceil(bytes / ((1024 * 1024) / 10)) / 10);
}
