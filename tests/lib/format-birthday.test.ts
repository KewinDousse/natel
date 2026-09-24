/**
 * Unit tests for src/lib/format-birthday.ts — Intl-based birthday display
 * with graceful handling of partial dates.
 */

import { describe, expect, it } from "vitest";
import { birthdayDateTime, formatBirthday } from "@/lib/format-birthday";
import type { Birthday } from "@/vcard";

const bday = (overrides: Partial<Birthday>): Birthday => ({
  source: "",
  year: null,
  month: null,
  day: null,
  ...overrides,
});

describe("formatBirthday", () => {
  it("formats a full date in the given locale", () => {
    const full = bday({ year: 1987, month: 3, day: 14 });
    expect(formatBirthday(full, "fr")).toBe("14 mars 1987");
    expect(formatBirthday(full, "en-GB")).toBe("14 March 1987");
    expect(formatBirthday(full, "en-US")).toBe("March 14, 1987");
  });

  it("formats a month-day without a year", () => {
    const md = bday({ year: null, month: 3, day: 14 });
    expect(formatBirthday(md, "fr")).toBe("14 mars");
    expect(formatBirthday(md, "en")).toBe("March 14");
  });

  it("formats a year-month and a year-only date", () => {
    expect(formatBirthday(bday({ year: 1987, month: 3, day: null }), "fr")).toBe("mars 1987");
    expect(formatBirthday(bday({ year: 1987, month: null, day: null }), "fr")).toBe("1987");
    expect(formatBirthday(bday({ year: 1987, month: null, day: null }), "en")).toBe("1987");
  });

  it("falls back to the raw source when no part is usable", () => {
    expect(formatBirthday(bday({ source: "--" }), "fr")).toBe("--");
  });
});

describe("birthdayDateTime", () => {
  it("emits ISO dates, --MM-DD partials and bare years", () => {
    expect(birthdayDateTime(bday({ year: 1987, month: 3, day: 14 }))).toBe("1987-03-14");
    expect(birthdayDateTime(bday({ year: null, month: 3, day: 14 }))).toBe("--03-14");
    expect(birthdayDateTime(bday({ year: 1987, month: null, day: null }))).toBe("1987");
  });
});
