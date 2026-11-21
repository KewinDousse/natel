/**
 * The dates a card records about itself: REV (RFC 6350 §6.7.4), and CREATED
 * or X-CREATED, which some clients write. Read-only.
 */

import { describe, expect, it } from "vitest";
import {
  createdOf,
  parse,
  revisionOf,
  serialise,
  serialiseRaw,
  unshownPropertiesOf,
} from "@/vcard";

function card(version: string, ...lines: string[]): string {
  return ["BEGIN:VCARD", `VERSION:${version}`, "FN:Dates", ...lines, "END:VCARD", ""].join("\r\n");
}

// X-CREATED reaches the reader as written, which ical.js normalises for REV.
const readValue = (text: string) => createdOf(parse(card("3.0", `X-CREATED:${text}`)));

describe("reading a card date", () => {
  it.each([
    ["20240303T101010Z", "2024-03-03T10:10:10.000Z"],
    ["2024-03-03T10:10:10Z", "2024-03-03T10:10:10.000Z"],
    ["2024-03-03T10:10:10.123Z", "2024-03-03T10:10:10.123Z"],
    ["20240303T1010z", "2024-03-03T10:10:00.000Z"],
    ["2024-03-03T10:10:10+02:00", "2024-03-03T08:10:10.000Z"],
    ["20240303T101010+0200", "2024-03-03T08:10:10.000Z"],
    ["20240303T101010-05", "2024-03-03T15:10:10.000Z"],
  ])("reads the instant of %s", (text, iso) => {
    expect(readValue(text)).toEqual({ date: new Date(iso), hasTime: true });
  });

  it("reads a time without a zone as local time", () => {
    expect(readValue("2024-03-03T10:10:10")).toEqual({
      date: new Date(2024, 2, 3, 10, 10, 10),
      hasTime: true,
    });
  });

  it.each(["2024-03-03", "20240303", "2024-03-03 "])("reads %j as a local day", (text) => {
    expect(readValue(text)).toEqual({ date: new Date(2024, 2, 3), hasTime: false });
  });

  it.each([
    "",
    "garbage",
    "yesterday",
    "2024",
    "2024-03",
    "--0303",
    "2024-13-01",
    "2024-00-10",
    "2023-02-29",
    "2024-04-31",
    "2024-03-03T24:00:00Z",
    "2024-03-03T10:60:00Z",
    "2024-03-03T10:10:60Z",
    "2024-03-03T10:10:10+2",
    "2024--0-3-T3T:10::1",
    "2024-03-03T::",
  ])("reads nothing from %j", (text) => {
    expect(readValue(text)).toBeNull();
  });

  it("accepts 29 February in a leap year", () => {
    expect(readValue("2024-02-29")?.date).toEqual(new Date(2024, 1, 29));
  });
});

describe("revisionOf", () => {
  it.each(["3.0", "4.0"])("reads a %s REV in the basic form", (version) => {
    expect(revisionOf(parse(card(version, "REV:20261112T143000Z")))).toEqual({
      date: new Date("2026-11-12T14:30:00Z"),
      hasTime: true,
    });
  });

  it("reads a 3.0 REV in the extended form, with a fraction, and a date alone", () => {
    expect(revisionOf(parse(card("3.0", "REV:2026-11-12T14:30:00Z")))?.date).toEqual(
      new Date("2026-11-12T14:30:00Z"),
    );
    expect(revisionOf(parse(card("3.0", "REV:2026-11-12T14:30:00.250Z")))?.date).toEqual(
      new Date("2026-11-12T14:30:00.250Z"),
    );
    expect(revisionOf(parse(card("3.0", "REV;VALUE=DATE:20261112")))).toEqual({
      date: new Date(2026, 10, 12),
      hasTime: false,
    });
  });

  // ADR 057: ical.js's 4.0 timestamp codec would drop the offset or garble the value.
  it.each([
    ["20261112T143000+0200", "2026-11-12T12:30:00.000Z"],
    ["20261112T143000-05", "2026-11-12T19:30:00.000Z"],
    ["2026-11-12T14:30:00Z", "2026-11-12T14:30:00.000Z"],
  ])("reads a 4.0 REV:%s as the instant it names", (value, instant) => {
    expect(revisionOf(parse(card("4.0", `REV:${value}`)))?.date.toISOString()).toBe(instant);
  });

  it("reads a 4.0 REV without a zone as local time, and a date alone as a day", () => {
    expect(revisionOf(parse(card("4.0", "REV:20261112T143000")))?.date).toEqual(
      new Date(2026, 10, 12, 14, 30),
    );
    for (const value of ["20261112", "2026-11-12"]) {
      expect(revisionOf(parse(card("4.0", `REV:${value}`)))).toEqual({
        date: new Date(2026, 10, 12),
        hasTime: false,
      });
    }
  });

  it("reads nothing from a card without one, or from one that isn't a date", () => {
    expect(revisionOf(parse(card("3.0")))).toBeNull();
    expect(revisionOf(parse(card("4.0", "REV:garbage")))).toBeNull();
    expect(revisionOf(parse(card("3.0", "REV:garbage")))).toBeNull();
    expect(revisionOf(parse(card("4.0", "REV;VALUE=text:yesterday")))).toBeNull();
  });
});

describe("createdOf", () => {
  it.each(["X-CREATED", "CREATED", "item1.X-CREATED"])("reads %s", (name) => {
    expect(createdOf(parse(card("3.0", `${name}:20210418T093000Z`)))?.date).toEqual(
      new Date("2021-04-18T09:30:00Z"),
    );
  });

  it("takes the first readable one", () => {
    const contact = parse(card("4.0", "CREATED:unknown", "X-CREATED:2021-04-18"));
    expect(createdOf(contact)).toEqual({ date: new Date(2021, 3, 18), hasTime: false });
  });

  it("reads nothing without a readable one", () => {
    expect(createdOf(parse(card("3.0")))).toBeNull();
    expect(createdOf(parse(card("3.0", "X-CREATED:soon")))).toBeNull();
  });
});

describe("card dates on save", () => {
  const LINES = [
    "REV:20261112T143000Z",
    "X-CREATED:2021-04-18T09:30:00Z",
    "CREATED;X-KEEP=yes:20210418",
    "item1.X-CREATED:garbage",
  ];

  it.each(["3.0", "4.0"])("write a %s card's dates back as they are", (version) => {
    const text = card(version, ...LINES);
    const contact = parse(text);
    contact.fields.fn = "Renamed";
    // ical.js writes a group in capitals.
    const lines = (text: string) => text.toUpperCase().split("\r\n");
    const expected = LINES.map((line) => line.toUpperCase());
    expect(lines(serialise(contact))).toEqual(expect.arrayContaining(expected));
    expect(lines(serialiseRaw(parse(text)))).toEqual(expect.arrayContaining(expected));
  });

  it.each(["REV:20261112T143000+0200", "REV:2026-11-12T14:30:00Z", "REV:20261112", "REV:garbage"])(
    "write a 4.0 %s back as it is",
    (line) => {
      const text = card("4.0", line);
      const contact = parse(text);
      contact.fields.fn = "Renamed";
      expect(serialise(contact).split("\r\n")).toContain(line);
      expect(serialiseRaw(parse(text))).toBe(text);
    },
  );

  it("reading them changes nothing", () => {
    const contact = parse(card("3.0", ...LINES));
    const before = serialiseRaw(contact);
    revisionOf(contact);
    createdOf(contact);
    expect(serialiseRaw(contact)).toBe(before);
  });

  it("stay in the details not shown while the page hides them", () => {
    const lines = unshownPropertiesOf(parse(card("3.0", ...LINES)), { datesShown: false });
    expect(lines.some((line) => line.startsWith("CREATED;X-KEEP"))).toBe(true);
    expect(lines).toContain("X-CREATED:2021-04-18T09:30:00Z");
    expect(lines.some((line) => line.startsWith("REV"))).toBe(false);
  });

  it("leave out of the details not shown only the creation date the page shows", () => {
    const lines = unshownPropertiesOf(parse(card("3.0", "CREATED:soon", ...LINES)), {
      datesShown: true,
    });
    expect(lines).toContain("CREATED:soon");
    expect(lines).toContain("X-CREATED:2021-04-18T09:30:00Z");
    expect(lines.map((line) => line.toUpperCase())).toContain("ITEM1.X-CREATED:GARBAGE");
    expect(lines.some((line) => line.startsWith("CREATED;X-KEEP"))).toBe(false);
    expect(lines.some((line) => line.startsWith("REV"))).toBe(false);
  });
});
