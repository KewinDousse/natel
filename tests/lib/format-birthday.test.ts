/**
 * Unit tests for src/lib/format-birthday.ts — Intl-based birthday display
 * with graceful handling of partial dates.
 */

import { describe, expect, it } from "vitest";
import { ageOf, birthdayCopyText, birthdayDateTime, formatBirthday } from "@/lib/format-birthday";
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

  it.each([
    { year: 5, fr: ["12 mars 5", "mars 5", "5"], en: ["March 12, 5", "March 5", "5"] },
    { year: 45, fr: ["12 mars 45", "mars 45", "45"], en: ["March 12, 45", "March 45", "45"] },
    { year: 99, fr: ["12 mars 99", "mars 99", "99"], en: ["March 12, 99", "March 99", "99"] },
    {
      year: 100,
      fr: ["12 mars 100", "mars 100", "100"],
      en: ["March 12, 100", "March 100", "100"],
    },
  ])("shows the year $year as stored, not in the 1900s", ({ year, fr, en }) => {
    const forms = [
      bday({ year, month: 3, day: 12 }),
      bday({ year, month: 3, day: null }),
      bday({ year, month: null, day: null }),
    ];
    expect(forms.map((form) => formatBirthday(form, "fr"))).toEqual(fr);
    expect(forms.map((form) => formatBirthday(form, "en"))).toEqual(en);
  });

  it("keeps 29 February of a leap year below 100", () => {
    expect(formatBirthday(bday({ year: 96, month: 2, day: 29 }), "en")).toBe("February 29, 96");
  });

  it("shows a year 0 as its stored date", () => {
    const stored = (source: string, parts: Partial<Birthday>) =>
      formatBirthday(bday({ source, year: 0, ...parts }), "en");
    expect(stored("0000-03-12", { month: 3, day: 12 })).toBe("0000-03-12");
    expect(stored("0000-03-12T10:15:00Z", { month: 3, day: 12 })).toBe("0000-03-12");
    expect(stored("0000-03", { month: 3 })).toBe("0000-03");
    expect(stored("0000", {})).toBe("0000");
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

describe("birthdayCopyText", () => {
  it("copies the stored value", () => {
    expect(birthdayCopyText(bday({ source: "1987-03-14", year: 1987, month: 3, day: 14 }))).toBe(
      "1987-03-14",
    );
  });

  it("copies any day and month without a year in the extended form", () => {
    expect(birthdayCopyText(bday({ source: "--0314", month: 3, day: 14 }))).toBe("--03-14");
  });

  it("copies a day and month without the year Apple stores in its place", () => {
    expect(birthdayCopyText(bday({ source: "1604-07-14", month: 7, day: 14 }))).toBe("--07-14");
  });
});

describe("ageOf", () => {
  const born = (year: number | null, month: number | null, day: number | null): Birthday => ({
    source: "",
    year,
    month,
    day,
  });

  it("counts the years, turning one older on the birthday itself", () => {
    expect(ageOf(born(1987, 3, 14), new Date(2026, 2, 13))).toBe(38);
    expect(ageOf(born(1987, 3, 14), new Date(2026, 2, 14))).toBe(39);
  });

  it("turns a 29 February birthday one older on 1 March in a common year", () => {
    expect(ageOf(born(2000, 2, 29), new Date(2027, 1, 28))).toBe(26);
    expect(ageOf(born(2000, 2, 29), new Date(2027, 2, 1))).toBe(27);
  });

  it("turns a 29 February birthday one older on 29 February in a leap year", () => {
    expect(ageOf(born(2000, 2, 29), new Date(2028, 1, 28))).toBe(27);
    expect(ageOf(born(2000, 2, 29), new Date(2028, 1, 29))).toBe(28);
  });

  it("gives an age up to 130", () => {
    expect(ageOf(born(1896, 3, 14), new Date(2026, 5, 1))).toBe(130);
    expect(ageOf(born(1895, 3, 14), new Date(2026, 5, 1))).toBeNull();
  });

  it("gives none before a first birthday or past any human age", () => {
    expect(ageOf(born(2026, 3, 14), new Date(2026, 5, 1))).toBeNull();
    expect(ageOf(born(1604, 3, 14), new Date(2026, 5, 1))).toBeNull();
  });

  it("gives none without a year or a day, or before the birth", () => {
    expect(ageOf(born(null, 3, 14), new Date(2026, 5, 1))).toBeNull();
    expect(ageOf(born(1987, 3, null), new Date(2026, 5, 1))).toBeNull();
    expect(ageOf(born(2030, 1, 1), new Date(2026, 5, 1))).toBeNull();
  });
});
