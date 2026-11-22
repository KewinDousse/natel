/**
 * Tests for vCard integer, float and boolean values, held as written (ADR 060).
 */
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import {
  addCategory,
  groupsOf,
  parse,
  readImportCard,
  serialise,
  unshownPropertiesOf,
} from "@/vcard";

const card = (version: string, lines: string[]) =>
  parse(["BEGIN:VCARD", `VERSION:${version}`, "FN:X", ...lines, "END:VCARD", ""].join("\r\n"));

// ical.js writes the VALUE parameter in capitals.
const lines = [
  "X-ID;VALUE=INTEGER:007",
  "X-RANK;VALUE=INTEGER:+5",
  "X-LIST;VALUE=INTEGER:1,2",
  "X-WEIGHT;VALUE=FLOAT:1.50",
  "X-SCALE;VALUE=FLOAT:1e3",
  "X-SET;VALUE=BOOLEAN:true",
  "X-OFF;VALUE=BOOLEAN:FALSE",
];

describe.each(["3.0", "4.0"])("%s integer, float and boolean values", (version) => {
  it("keeps every untouched value as written when another field is edited", () => {
    const contact = card(version, lines);
    contact.fields.note = "edited";
    const text = serialise(contact);
    for (const line of lines) expect(text).toContain(`\r\n${line}\r\n`);
  });

  it("keeps the value of a lowercase VALUE type", () => {
    const contact = card(version, ["X-ID;VALUE=integer:007", "X-WEIGHT;VALUE=float:1.50"]);
    contact.fields.note = "edited";
    const text = serialise(contact);
    expect(text).toContain("\r\nX-ID;VALUE=INTEGER:007\r\n");
    expect(text).toContain("\r\nX-WEIGHT;VALUE=FLOAT:1.50\r\n");
  });

  it("lists them as written among the card's unshown properties", () => {
    expect(unshownPropertiesOf(card(version, lines))).toEqual(lines);
  });
});

describe.each(["3.0", "4.0"])("%s property Natel edits, written with these types", (version) => {
  it("shows its value as written and is saved with the version's default type", () => {
    const contact = card(version, [
      "NOTE;VALUE=integer:0042",
      "TITLE;VALUE=boolean:true",
      "ORG;VALUE=float:1.50",
    ]);
    expect(contact.fields.note).toBe("0042");
    expect(contact.fields.title).toBe("true");
    expect(contact.fields.org).toBe("1.50");
    const text = serialise(contact);
    expect(text).toContain("\r\nNOTE:0042\r\n");
    expect(text).toContain("\r\nTITLE:true\r\n");
    expect(text).toContain("\r\nORG:1.50\r\n");
  });

  it.each(["integer", "float", "boolean"])("escapes an edit as text when typed %s", (type) => {
    const typed = (name: string, value = "1") => `${name};VALUE=${type}:${value}`;
    const contact = parse(
      [
        "BEGIN:VCARD",
        `VERSION:${version}`,
        ...["FN", "NICKNAME", "ORG", "TITLE", "URL", "NOTE", "TEL", "EMAIL", "CATEGORIES"].map(
          (name) => typed(name),
        ),
        typed("N", "1;;;;"),
        typed("ADR", ";;1;;;;"),
        "END:VCARD",
        "",
      ].join("\r\n"),
    );
    const edit = "line one\nline two, three; four";
    const { fields } = contact;
    fields.fn = edit;
    fields.n.family = edit;
    fields.nickname = edit;
    fields.org = edit;
    fields.title = edit;
    fields.note = edit;
    fields.url = "https://example.org/a,b";
    for (const field of fields.tel) field.value = "+41 79 123 45 67";
    for (const field of fields.email) field.value = "a@example.org";
    for (const address of fields.adr) address.street = edit;
    addCategory(contact, "a, b; c");
    const saved = parse(serialise(contact));
    const read = saved.fields;
    expect([read.fn, read.n.family, read.nickname, read.org, read.title, read.note]).toEqual(
      Array(6).fill(edit),
    );
    expect(read.adr.map((address) => address.street)).toEqual([edit]);
    expect(read.url).toBe("https://example.org/a,b");
    expect(read.tel.map((field) => field.value)).toEqual(["+41 79 123 45 67"]);
    expect(read.email.map((field) => field.value)).toEqual(["a@example.org"]);
    expect(groupsOf(saved)).toContain("a, b; c");
  });

  it("keeps the value of an untouched one that holds escapes", () => {
    const contact = card(version, [
      "NOTE;VALUE=integer:a\\nb\\, c\\\\d",
      "TITLE;VALUE=float:A\\,B",
    ]);
    expect(contact.fields.note).toBe("a\nb, c\\d");
    expect(contact.fields.title).toBe("A,B");
    const text = serialise(contact);
    expect(text).toContain("\r\nNOTE:a\\nb\\, c\\\\d\r\n");
    expect(text).toContain("\r\nTITLE:A\\,B\r\n");
  });

  it("reads and saves a typed list and a second typed phone", () => {
    const contact = card(version, [
      "CATEGORIES;VALUE=integer:1,2",
      "NICKNAME;VALUE=integer:3,4",
      "TEL;VALUE=integer:5",
      "TEL;VALUE=integer:6",
    ]);
    expect(contact.fields.tel.map((tel) => tel.value)).toEqual(["5", "6"]);
    const text = serialise(contact);
    expect(text).toContain("\r\nCATEGORIES:1,2\r\n");
    expect(text).toContain("\r\nNICKNAME:3,4\r\n");
    expect(text).not.toContain("VALUE=INTEGER");
  });

  it("keeps a later NOTE, which Natel doesn't show, as written", () => {
    const contact = card(version, ["NOTE:shown", "NOTE;VALUE=integer:007"]);
    expect(serialise(contact)).toContain("\r\nNOTE;VALUE=INTEGER:007\r\n");
  });
});

describe.each([
  ["VERSION 2.1", ["VERSION:2.1"]],
  ["no VERSION", []],
])("card with %s", (_, version) => {
  it("reads a NOTE typed integer that holds a list and saves it as one text", () => {
    const lines = ["BEGIN:VCARD", ...version, "FN:X", "NOTE;VALUE=integer:1,2", "END:VCARD", ""];
    const contact = parse(lines.join("\r\n"));
    expect(contact.fields.note).toBe("1,2");
    const text = serialise(contact);
    expect(text).toContain("\r\nNOTE:1\\,2\r\n");
    expect(parse(text).fields.note).toBe("1,2");
  });
});

describe("import", () => {
  it("reads a typed FN as the contact page does", () => {
    const text = "BEGIN:VCARD\r\nVERSION:4.0\r\nFN;VALUE=integer:A\\,B\r\nEND:VCARD\r\n";
    expect(readImportCard(text).name).toBe("A,B");
  });
});

describe("3.0 GEO", () => {
  it("keeps its two floats as written", () => {
    const contact = card("3.0", ["GEO:46.50;6.60"]);
    contact.fields.note = "edited";
    expect(serialise(contact)).toContain("\r\nGEO:46.50;6.60\r\n");
  });
});

describe("iCalendar values", () => {
  it("are still read as numbers and booleans", () => {
    const values = ICAL.design.icalendar.value;
    expect(values.integer?.fromICAL("007")).toBe(7);
    expect(values.float?.fromICAL("1.50")).toBe(1.5);
    expect(values.boolean?.fromICAL("TRUE")).toBe(true);
  });
});
