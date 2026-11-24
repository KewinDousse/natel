/**
 * A NOTE with an unescaped comma, which ical.js reads as a list in a 3.0
 * card, and in a card with VERSION 2.1 or none.
 */
import { describe, expect, it } from "vitest";
import { noteOf, parse, serialise, serialiseRaw } from "@/vcard";

const cardOf = (version: readonly string[]) => (note: string) =>
  parse(["BEGIN:VCARD", ...version, "FN:X", note, "END:VCARD", ""].join("\r\n"));

describe.each([
  ["3.0", ["VERSION:3.0"]],
  ["2.1", ["VERSION:2.1"]],
  ["no VERSION", []],
])("NOTE with a comma in a card with %s", (_, version) => {
  const card = cardOf(version);

  it("shows the whole note, unescaped or escaped", () => {
    expect(noteOf(card("NOTE:hello, world"))).toBe("hello, world");
    expect(noteOf(card("NOTE:hello\\, world"))).toBe("hello, world");
  });

  it("writes an edited note as one value, its commas escaped", () => {
    const contact = card("NOTE:hello, world");
    contact.fields.note = "hello!, world";
    const text = serialise(contact);
    expect(text).toContain("\r\nNOTE:hello!\\, world\r\n");
    expect(noteOf(parse(text))).toBe("hello!, world");
  });

  it("edits the first note only, keeping its parameters and a second note", () => {
    const contact = card("NOTE;LANGUAGE=fr:hello, world\r\nNOTE:second\\, note");
    contact.fields.note = "salut";
    const text = serialise(contact);
    expect(text).toContain("\r\nNOTE;LANGUAGE=fr:salut\r\n");
    expect(text).toContain("\r\nNOTE:second\\, note\r\n");
  });

  it("removes a note cleared in full", () => {
    const contact = card("NOTE:hello, world");
    contact.fields.note = "";
    expect(serialise(contact)).not.toContain("NOTE");
  });
});

describe("3.0 NOTE with a comma", () => {
  const card = cardOf(["VERSION:3.0"]);

  it("keeps an untouched note as written when another field is edited", () => {
    const contact = card("NOTE:hello, world");
    contact.fields.title = "edited";
    expect(serialise(contact)).toContain("\r\nNOTE:hello, world\r\n");
  });

  it("keeps an untouched mix of escaped and unescaped commas as written", () => {
    const contact = card("NOTE:a\\,b,c");
    expect(contact.fields.note).toBe("a,b,c");
    contact.fields.title = "edited";
    expect(serialise(contact)).toContain("\r\nNOTE:a\\,b,c\r\n");
  });

  it("keeps a second note as written", () => {
    expect(serialise(card("NOTE:shown\r\nNOTE:second, note"))).toContain(
      "\r\nNOTE:second, note\r\n",
    );
  });
});

// Written with the 4.0 design, where a NOTE holds one value.
describe.each([
  ["2.1", ["VERSION:2.1"]],
  ["no VERSION", []],
])("NOTE with a comma in a card with %s", (_, version) => {
  const card = cardOf(version);

  it("writes an untouched note whole when another field is edited", () => {
    const contact = card("NOTE:a\\,b, c");
    expect(contact.fields.note).toBe("a,b, c");
    contact.fields.title = "edited";
    expect(serialise(contact)).toContain("\r\nNOTE:a\\,b\\, c\r\n");
  });

  it("writes every note whole when no field is edited", () => {
    const text = serialiseRaw(card("NOTE:hello, world\r\nNOTE:second, note"));
    expect(text).toContain("\r\nNOTE:hello\\, world\r\n");
    expect(text).toContain("\r\nNOTE:second\\, note\r\n");
  });
});

describe("4.0 NOTE held as a uri", () => {
  it("writes an edited note with its line break and comma escaped", () => {
    const contact = parse(
      [
        "BEGIN:VCARD",
        "VERSION:4.0",
        "FN:X",
        "NOTE;VALUE=uri:http://a.example/x",
        "END:VCARD",
        "",
      ].join("\r\n"),
    );
    contact.fields.note = "line1\nEND:VCARD, x";
    expect(serialise(contact)).toContain("\r\nNOTE;VALUE=URI:line1\\nEND:VCARD\\, x\r\n");
  });
});
