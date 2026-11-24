/**
 * Tests for vCard date and time values that are not written as the type
 * expects, held as written (ADR 064).
 */
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { parse, serialise, unshownPropertiesOf } from "@/vcard";
import { keepNonDatesAsWritten } from "@/vcard/ical-workarounds";

const card = (version: string, lines: string[]) =>
  parse(["BEGIN:VCARD", `VERSION:${version}`, "FN:X", ...lines, "END:VCARD", ""].join("\r\n"));

const saved = (version: string, lines: string[]) => {
  const contact = card(version, lines);
  contact.fields.note = "edited";
  return serialise(contact);
};

describe.each(["3.0", "4.0"])("%s date that is not a date", (version) => {
  // ical.js writes the VALUE parameter in capitals.
  const lines = [
    "ANNIVERSARY:circa 1987",
    "X-SINCE;VALUE=DATE:12.04.1987",
    "X-MET;VALUE=DATE-TIME:spring 2020",
    "X-AT;VALUE=TIME:around noon",
  ];

  it("is kept as written when another field is edited, save after save", () => {
    const first = saved(version, lines);
    for (const line of lines) expect(first).toContain(`\r\n${line}\r\n`);
    const again = parse(first);
    again.fields.org = "edited";
    const second = serialise(again);
    for (const line of lines) expect(second).toContain(`\r\n${line}\r\n`);
  });

  it("is listed as written among the card's unshown properties", () => {
    expect(unshownPropertiesOf(card(version, lines), { datesShown: false })).toEqual(lines);
  });
});

describe.each(["3.0", "4.0"])("%s birthday in free text", (version) => {
  it.each([
    "Mai 1987",
    "born Today",
    "mi-avril",
    "Tuesday",
    "12 avril 1987",
    "04/12/87",
    "12-04-1987",
    "1987-4-12",
    "1987-04-12 ",
    "+1987-04-12",
    "19870412t102200z",
    "10:22:00",
  ])("keeps %s as written", (value) => {
    const contact = card(version, [`BDAY:${value}`]);
    expect(contact.fields.bday?.source).toBe(value);
    const first = saved(version, [`BDAY:${value}`]);
    expect(first).toContain(`\r\nBDAY;VALUE=TEXT:${value}\r\n`);
    const again = parse(first);
    again.fields.org = "edited";
    expect(serialise(again)).toContain(`\r\nBDAY;VALUE=TEXT:${value}\r\n`);
  });

  // ical.js reads only the year of these as a date.
  it.each(["20200101T100000+01:00", "198704", "1987-04-12Z"])("shows %s as text", (value) => {
    expect(card(version, [`BDAY:${value}`]).fields.bday).toMatchObject({
      source: value,
      valueType: "text",
      year: null,
    });
    const first = saved(version, [`BDAY:${value}`]);
    expect(first).toContain(`\r\nBDAY;VALUE=TEXT:${value}\r\n`);
    const again = parse(first);
    again.fields.org = "edited";
    expect(serialise(again)).toContain(`\r\nBDAY;VALUE=TEXT:${value}\r\n`);
  });

  it("keeps a list of dates as one text", () => {
    expect(saved(version, ["BDAY:19870412,19880513"])).toContain(
      "\r\nBDAY;VALUE=TEXT:19870412\\,19880513\r\n",
    );
  });

  it("keeps a bare T after a date, on a save and on an edit of the date", () => {
    const line = "BDAY:1987-04-12T";
    expect(card(version, [line]).fields.bday).toMatchObject({ year: 1987, month: 4, day: 12 });
    expect(saved(version, [line])).toContain(`\r\n${line}\r\n`);
    const contact = card(version, [line]);
    if (contact.fields.bday)
      contact.fields.bday = { ...contact.fields.bday, year: 1990, month: 5, day: 6 };
    expect(serialise(contact)).toContain("\r\nBDAY:1990-05-06T\r\n");
  });

  it("shows a basic date with a bare T as text", () => {
    expect(card(version, ["BDAY:19870412T"]).fields.bday).toMatchObject({
      source: "19870412T",
      valueType: "text",
      year: null,
    });
    const first = saved(version, ["BDAY:19870412T"]);
    expect(first).toContain("\r\nBDAY;VALUE=TEXT:19870412T\r\n");
    const again = parse(first);
    again.fields.org = "edited";
    expect(serialise(again)).toContain("\r\nBDAY;VALUE=TEXT:19870412T\r\n");
  });

  it("shows a date-time with a decimal comma as written", () => {
    const contact = card(version, ["BDAY:1987-04-12T10:22:00,5Z"]);
    expect(contact.fields.bday?.source).toBe("1987-04-12T10:22:00,5Z");
    expect(saved(version, ["BDAY:1987-04-12T10:22:00,5Z"])).toContain(
      "\r\nBDAY;VALUE=TEXT:1987-04-12T10:22:00\\,5Z\r\n",
    );
  });

  it("reads a birthday whose zone is a lowercase z", () => {
    const line = "BDAY:19870412T102200z";
    expect(card(version, [line]).fields.bday).toMatchObject({ year: 1987, month: 4, day: 12 });
    expect(saved(version, [line])).toContain(`\r\n${line}\r\n`);
  });

  it("reads a birthday whose time has no seconds", () => {
    expect(card(version, ["BDAY:1987-04-12T10:22"]).fields.bday).toMatchObject({
      year: 1987,
      month: 4,
      day: 12,
    });
    expect(saved(version, ["BDAY:1987-04-12T10:22"])).toContain("\r\nBDAY:19870412T1022\r\n");
  });
});

describe("value of a date's characters that is not a date", () => {
  it.each([
    // ical.js reads its write of these readings otherwise.
    ["4.0", "X-A;VALUE=TIME:12-22"],
    ["4.0", "X-A;VALUE=TIME:25--10"],
    // ical.js's readings of these drop characters.
    ["3.0", "X-A;VALUE=TIME:198710--"],
    ["3.0", "X-A;VALUE=TIME:0412--:"],
    ["3.0", "X-A;VALUE=TIME:1987---"],
    // ical.js's date objects of these readings throw or are `--00-00`.
    ["3.0", "X-A;VALUE=TIME:22::2:1Z"],
    ["3.0", "X-A;VALUE=DATE:--0--00"],
    ["4.0", "X-A;VALUE=DATE:--0--00"],
    ["3.0", "X-A;VALUE=DATE-TIME:--0--00"],
    ["4.0", "X-A;VALUE=DATE-AND-OR-TIME:--0--00"],
  ])("%s %s is kept as written", (version, line) => {
    expect(saved(version, [line])).toContain(`\r\n${line}\r\n`);
  });
});

describe.each([
  ["VERSION 2.1", ["VERSION:2.1"]],
  ["no VERSION", []],
])("card with %s", (_, version) => {
  it("keeps a date that is not a date as written", () => {
    const text = ["BEGIN:VCARD", ...version, "FN:X", "X-SINCE;VALUE=DATE:abcd-ef-gh", "END:VCARD"];
    const contact = parse(`${text.join("\r\n")}\r\n`);
    contact.fields.note = "edited";
    expect(serialise(contact)).toContain("\r\nX-SINCE;VALUE=DATE:abcd-ef-gh\r\n");
  });
});

describe("4.0 timestamp", () => {
  it.each([
    "X-SEEN;VALUE=TIMESTAMP:last week",
    "X-SEEN;VALUE=TIMESTAMP:20200101T100000+0100",
    "X-SEEN;VALUE=TIMESTAMP:2020-01-01T10:00:00.000Z",
    "X-SEEN;VALUE=TIMESTAMP:19870412",
  ])("keeps %s as written", (line) => {
    expect(saved("4.0", [line])).toContain(`\r\n${line}\r\n`);
  });

  it("keeps one in the extended form as written", () => {
    const line = "X-SEEN;VALUE=TIMESTAMP:2020-01-01T10:00:00Z";
    expect(saved("4.0", [line])).toContain(`\r\n${line}\r\n`);
  });

  it("keeps one in the extended form as written in a card without VERSION", () => {
    const line = "X-SEEN;VALUE=TIMESTAMP:2020-01-01T10:00:00Z";
    const contact = parse(["BEGIN:VCARD", "FN:X", line, "END:VCARD", ""].join("\r\n"));
    contact.fields.note = "edited";
    expect(serialise(contact)).toContain(`\r\n${line}\r\n`);
  });
});

describe("dates written as their type expects", () => {
  it.each([
    ["3.0", "BDAY:1987-04-12", "BDAY;VALUE=DATE:19870412"],
    ["3.0", "BDAY:--04-12", "BDAY;VALUE=DATE:--0412"],
    ["4.0", "BDAY:19870412", "BDAY:19870412"],
    ["4.0", "BDAY:--0412", "BDAY:--0412"],
    ["4.0", "ANNIVERSARY:1987-04-12", "ANNIVERSARY:19870412"],
    ["4.0", "ANNIVERSARY:19870412T102200Z", "ANNIVERSARY:19870412T102200Z"],
    ["4.0", "X-AT;VALUE=TIME:102200", "X-AT;VALUE=TIME:102200"],
    ["4.0", "ANNIVERSARY:2010-06-15T00:00:00+0200", "ANNIVERSARY:20100615T000000+0200"],
    ["4.0", "BDAY:1987-04-12T10:22:00+0100", "BDAY:19870412T102200+0100"],
    ["3.0", "BDAY:1987-04-12T10:22:00+0100", "BDAY:19870412T102200+0100"],
    ["4.0", "BDAY:19870412T10:22:00Z", "BDAY:19870412T102200Z"],
    ["4.0", "BDAY:1987-04-12T10:22:00+01:00", "BDAY:19870412T102200+0100"],
    [
      "3.0",
      "X-MET;VALUE=DATE-TIME:1987-04-12T10:22:00+0100",
      "X-MET;VALUE=DATE-TIME:19870412T102200+0100",
    ],
    ["4.0", "BDAY;X-APPLE-OMIT-YEAR=1604:1604-04-12", "BDAY;X-APPLE-OMIT-YEAR=1604:16040412"],
  ])("%s %s is still written %s", (version, line, written) => {
    expect(saved(version, [line])).toContain(`\r\n${written}\r\n`);
  });

  it.each(["BDAY:19870412T10:22:00Z", "BDAY:1987-04-12T10:22:00+0100"])(
    "still reads the day of %s",
    (line) => {
      expect(card("4.0", [line]).fields.bday).toMatchObject({ year: 1987, month: 4, day: 12 });
    },
  );

  it("still reads a birthday", () => {
    expect(card("4.0", ["BDAY:19870412"]).fields.bday).toMatchObject({
      year: 1987,
      month: 4,
      day: 12,
    });
    expect(card("3.0", ["BDAY:1987-04-12"]).fields.bday).toMatchObject({
      year: 1987,
      month: 4,
      day: 12,
    });
  });
});

describe("4.0 birthday typed timestamp", () => {
  it.each(["19870412T102200+0100", "19870412T102200.5Z", "19870412T100000Z"])(
    "shows %s as written",
    (value) => {
      const line = `BDAY;VALUE=timestamp:${value}`;
      expect(card("4.0", [line]).fields.bday?.source).toBe(value);
      expect(saved("4.0", [line])).toContain(`\r\nBDAY;VALUE=TEXT:${value}\r\n`);
    },
  );
});

describe("time in the extended form", () => {
  it.each([
    ["3.0", "10:22:00", "102200"],
    ["4.0", "10:22", "1022"],
  ])("%s %s is written in the basic form", (version, value, written) => {
    expect(saved(version, [`X-AT;VALUE=TIME:${value}`])).toContain(
      `\r\nX-AT;VALUE=TIME:${written}\r\n`,
    );
  });

  it.each(["3.0", "4.0"])("%s birthday T10:22 is read as written and saved as T1022", (version) => {
    expect(card(version, ["BDAY:T10:22"]).fields.bday?.source).toBe("T10:22");
    const first = saved(version, ["BDAY:T10:22"]);
    expect(first).toContain("\r\nBDAY:T1022\r\n");
    const again = parse(first);
    again.fields.org = "edited";
    expect(serialise(again)).toContain("\r\nBDAY:T1022\r\n");
  });
});

describe("the workaround applied twice", () => {
  it.each(["vcard", "vcard3"] as const)("leaves the %s codecs it already wrapped", (design) => {
    const values = ICAL.design[design].value;
    const before = { ...values };
    keepNonDatesAsWritten();
    for (const type of ["date", "time", "date-time", "date-and-or-time", "timestamp"]) {
      expect(values[type]).toBe(before[type]);
    }
  });
});

describe("iCalendar values", () => {
  it("are still read and written as ical.js does", () => {
    const values = ICAL.design.icalendar.value;
    expect(values.date?.toICAL("circa 1987")).toBe("circ 187");
    expect(values.time?.toICAL("around noon")).toBe("arun n");
    expect(values["date-time"]?.fromICAL("20200101T100000Z")).toBe("2020-01-01T10:00:00Z");
  });
});
