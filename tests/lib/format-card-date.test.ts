/** Tests for src/lib/format-card-date.ts: the short day in list rows. */

import { describe, expect, it } from "vitest";
import { formatShortCardDate } from "@/lib/format-card-date";

const now = new Date(2026, 10, 18, 9, 0);

describe("formatShortCardDate", () => {
  it("gives the day and month for this year", () => {
    const value = { date: new Date(2026, 10, 12, 14, 30), hasTime: true };
    expect(formatShortCardDate(value, "en", now)).toBe("Nov 12");
    expect(formatShortCardDate(value, "fr", now)).toBe("12 nov.");
  });

  it("gives the month and year before this year", () => {
    const value = { date: new Date(2024, 8, 3), hasTime: false };
    expect(formatShortCardDate(value, "en", now)).toBe("Sep 2024");
    expect(formatShortCardDate(value, "fr", now)).toBe("sept. 2024");
  });
});
