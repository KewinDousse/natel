/**
 * Apple's year-less birthday (ADR 028): vCard 3.0 has no date without a
 * year, so Apple writes year 1604 with `X-APPLE-OMIT-YEAR=1604`.
 */

import { describe, expect, it } from "vitest";
import { applyDraft, buildDraft, type ContactDraft } from "../../src/lib/contact-edit";
import { birthdayOf, parse, serialise } from "../../src/vcard";

function card(bdayLine: string, version = "3.0"): string {
  return [
    "BEGIN:VCARD",
    `VERSION:${version}`,
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
});

describe("writing", () => {
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
