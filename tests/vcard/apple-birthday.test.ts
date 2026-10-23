/**
 * Apple's year-less birthday (ADR 028): vCard 3.0 has no date without a
 * year, so Apple writes year 1604 with `X-APPLE-OMIT-YEAR=1604`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyDraft, buildDraft, type ContactDraft } from "../../src/lib/contact-edit";
import { formatBirthday } from "../../src/lib/format-birthday";
import { birthdayOf, parse, serialise } from "../../src/vcard";

function card(bdayLine: string, version = "3.0", prodid?: string): string {
  return [
    "BEGIN:VCARD",
    `VERSION:${version}`,
    ...(prodid ? [`PRODID:${prodid}`] : []),
    "FN:Bob Pommé",
    "N:Pommé;Bob;;;",
    bdayLine,
    "UID:apple-bday@example.com",
    "END:VCARD",
    "",
  ].join("\r\n");
}

function bdayLineAfter(text: string, change: (draft: ContactDraft) => void): string | undefined {
  const draft = buildDraft(parse(text));
  change(draft);
  return serialise(applyDraft(parse(text), draft))
    .split("\r\n")
    .find((line) => line.startsWith("BDAY"));
}

const APPLE = "BDAY;X-APPLE-OMIT-YEAR=1604;VALUE=date:1604-07-14";
const IOS = "-//Apple Inc.//iOS 26.6.1//EN";
const IOS_NO_MARKER = readFileSync(
  resolve(import.meta.dirname, "../fixtures/public/ios-birthday-no-marker.vcf"),
  "utf8",
);

describe("reading", () => {
  it("reads Apple's omitted year as no year", () => {
    expect(birthdayOf(parse(card(APPLE)))).toMatchObject({ year: null, month: 7, day: 14 });
  });

  it("keeps a year the parameter doesn't name", () => {
    const bday = birthdayOf(parse(card("BDAY;X-APPLE-OMIT-YEAR=1604:1987-07-14")));
    expect(bday).toMatchObject({ year: 1987, month: 7, day: 14 });
  });

  it("keeps the year of a year and month, which can't do without it", () => {
    const bday = birthdayOf(parse(card("BDAY;X-APPLE-OMIT-YEAR=1604:1604-07")));
    expect(bday).toMatchObject({ year: 1604, month: 7, day: null });
  });

  it("shows an empty year in the form", () => {
    expect(buildDraft(parse(card(APPLE))).bday).toMatchObject({ year: "", month: "7", day: "14" });
  });

  it("reads the iOS 3.0 placeholder without the marker as no year", () => {
    const contact = parse(IOS_NO_MARKER);
    const birthday = birthdayOf(contact);
    expect(birthday).toMatchObject({ year: null, month: 7, day: 14 });
    expect(buildDraft(contact).bday).toMatchObject({ year: "", month: "7", day: "14" });
    expect(birthday && formatBirthday(birthday, "fr")).toBe("14 juillet");
  });

  it.each([
    undefined,
    "-//Apple Inc.//macOS 26.6.1//EN",
    "+//IDN bitfire.at//DAVx5//EN",
    "-//Example//iOS 26.6.1//EN",
    "-//Apple Inc.//iOSish 26.6.1//EN",
  ])("keeps a literal 1604 outside an iOS card (%s)", (prodid) => {
    expect(birthdayOf(parse(card("BDAY;VALUE=date:1604-07-14", "3.0", prodid)))).toMatchObject({
      year: 1604,
      month: 7,
      day: 14,
    });
  });

  it.each(["not-a-date", "2026-01-01"])(
    "does not decode a producer carrying an unexpected value type (%s)",
    (prodid) => {
      const text = card("BDAY;VALUE=date:1604-07-14", "3.0", prodid).replace(
        "PRODID:",
        "PRODID;VALUE=date:",
      );
      const contact = parse(text);
      expect(birthdayOf(contact)).toMatchObject({ year: 1604, month: 7, day: 14 });
      expect(contact.raw.getFirstProperty("prodid")?.toJSON()).toEqual([
        "prodid",
        {},
        "date",
        prodid,
      ]);
    },
  );

  it.each([
    ["BDAY:1604-07-14", "4.0", 1604, 7, 14],
    ["BDAY:1604-07", "3.0", 1604, 7, null],
    ["BDAY:1604", "3.0", 1604, null, null],
    ["BDAY;X-APPLE-OMIT-YEAR=1987:1604-07-14", "3.0", 1604, 7, 14],
    ["BDAY:1987-07-14", "3.0", 1987, 7, 14],
  ])(
    "keeps the year outside the complete unmarked 3.0 placeholder (%s)",
    (line, version, year, month, day) => {
      expect(birthdayOf(parse(card(line, version, IOS)))).toMatchObject({ year, month, day });
    },
  );
});

describe("writing", () => {
  it("does not add the missing iOS marker when only a note changes", () => {
    const line = bdayLineAfter(IOS_NO_MARKER, (draft) => {
      draft.note = "Changed note";
    });
    expect(line).toBe("BDAY;VALUE=DATE:16040714");
  });

  it("writes the Apple marker when the marker-less birthday's day is edited", () => {
    const line = bdayLineAfter(IOS_NO_MARKER, (draft) => {
      if (draft.bday) draft.bday.day = "15";
    });
    expect(line).toContain("X-APPLE-OMIT-YEAR=1604");
    expect(line).toMatch(/:16040715$/);
  });

  it("writes a year entered on the marker-less iOS birthday", () => {
    const line = bdayLineAfter(IOS_NO_MARKER, (draft) => {
      if (draft.bday) draft.bday.year = "1990";
    });
    expect(line).toBe("BDAY;VALUE=DATE:19900714");
  });

  it("leaves the birthday as Apple wrote it when another field changes", () => {
    const line = bdayLineAfter(card(APPLE), (draft) => {
      draft.note = "Ligne";
    });
    expect(line).toBe("BDAY;X-APPLE-OMIT-YEAR=1604;VALUE=DATE:16040714");
  });

  it("keeps Apple's form when the day changes and the year stays empty", () => {
    const line = bdayLineAfter(card(APPLE), (draft) => {
      if (draft.bday) draft.bday.day = "15";
    });
    expect(line).toBe("BDAY;X-APPLE-OMIT-YEAR=1604;VALUE=DATE:16040715");
  });

  it("drops the parameter once a year is typed", () => {
    const line = bdayLineAfter(card(APPLE), (draft) => {
      if (draft.bday) draft.bday.year = "1990";
    });
    expect(line).toBe("BDAY;VALUE=DATE:19900714");
  });

  it("writes a 3.0 birthday whose year is cleared in Apple's form", () => {
    const line = bdayLineAfter(card("BDAY:1987-03-14"), (draft) => {
      if (draft.bday) draft.bday.year = "";
    });
    expect(line).toBe("BDAY;X-APPLE-OMIT-YEAR=1604;VALUE=DATE:16040314");
  });

  it("writes a year-less 3.0 birthday in Apple's form once it is edited", () => {
    const line = bdayLineAfter(card("BDAY:--0314"), (draft) => {
      if (draft.bday) draft.bday.day = "15";
    });
    expect(line).toBe("BDAY;X-APPLE-OMIT-YEAR=1604;VALUE=DATE:16040315");
  });

  it("keeps the time of a date-time whose year is cleared", () => {
    const line = bdayLineAfter(card("BDAY:1987-03-14T10:00:00"), (draft) => {
      if (draft.bday) draft.bday.year = "";
    });
    expect(line).toBe("BDAY;X-APPLE-OMIT-YEAR=1604:16040314T100000");
  });

  it("drops a parameter that doesn't name the year", () => {
    const line = bdayLineAfter(card("BDAY;X-APPLE-OMIT-YEAR=1604:1987-07-14"), (draft) => {
      if (draft.bday) draft.bday.day = "15";
    });
    expect(line).toBe("BDAY;VALUE=DATE:19870715");
  });

  it("writes a 4.0 birthday without the parameter, even when it came with one", () => {
    const line = bdayLineAfter(card(APPLE, "4.0"), (draft) => {
      if (draft.bday) draft.bday.day = "15";
    });
    expect(line).toBe("BDAY:--0715");
  });

  it("writes a 4.0 birthday whose year is cleared without one, as RFC 6350 allows", () => {
    const line = bdayLineAfter(card("BDAY:1987-03-14", "4.0"), (draft) => {
      if (draft.bday) draft.bday.year = "";
    });
    expect(line).toBe("BDAY:--0314");
  });
});
