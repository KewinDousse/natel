/** A day as `YYYY-MM-DD`, for a `<time>` dateTime attribute. */
export function isoDay(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}
