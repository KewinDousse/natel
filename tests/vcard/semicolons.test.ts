/**
 * Tests for the escaped semicolon in text and uri values (ADR 024).
 */
import { describe, expect, it } from "vitest";
import { parse, serialise } from "@/vcard";

const card = (lines: string[]) => parse(["BEGIN:VCARD", ...lines, "END:VCARD", ""].join("\r\n"));
const line = (text: string, name: string) =>
  text
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r?\n/)
    .find((l) => l.toUpperCase().startsWith(`${name}:`));

describe("escaped semicolons", () => {
  for (const version of ["3.0", "4.0"]) {
    it(`reads \\; as ; in a ${version} card's text, and keeps it through saves`, () => {
      const contact = card([`VERSION:${version}`, "FN:A\\;B", "NOTE:a\\;b", "TITLE:t\\;u"]);
      expect(contact.fields.fn).toBe("A;B");
      expect(contact.fields.note).toBe("a;b");
      expect(contact.fields.title).toBe("t;u");
      contact.fields.nickname = "edited";
      const again = parse(serialise(contact));
      expect(again.fields.note).toBe("a;b");
      again.fields.nickname = "again";
      expect(parse(serialise(again)).fields.note).toBe("a;b");
    });
  }

  it("still reads an escaped backslash before a semicolon as a backslash", () => {
    const contact = card(["VERSION:4.0", "FN:X", "NOTE:a\\\\\\;b c\\\\;d"]);
    expect(contact.fields.note).toBe("a\\;b c\\;d");
  });

  it("keeps structured values and CATEGORIES as they were", () => {
    const contact = card(["VERSION:3.0", "FN:X", "N:Fam\\;ily;Given;;;", "CATEGORIES:a\\,b,c\\;d"]);
    expect(contact.fields.n.family).toBe("Fam;ily");
    expect(contact.fields.n.given).toBe("Given");
    contact.fields.note = "edited";
    const text = serialise(contact);
    expect(line(text, "N")).toBe("N:Fam\\;ily;Given;;;");
    expect(line(text, "CATEGORIES")).toBe("CATEGORIES:a\\,b,c;d");
  });

  it("leaves a backslash in a parameter value as written", () => {
    for (const version of ["3.0", "4.0"]) {
      const source = [
        `VERSION:${version}`,
        "FN:X",
        'X-Q;X-P="a\\;b":v',
        'TEL;TYPE="x\\;y":+41 79 000 00 00',
      ];
      const contact = card(source);
      contact.fields.note = "edited";
      const text = serialise(contact).replace(/\r?\n[ \t]/g, "");
      expect(text).toContain('X-P="a\\;b":v');
      expect(text).toContain('TYPE="x\\;y":+41 79 000 00 00');
    }
  });

  it("reads \\; as ; in a 4.0 URL", () => {
    const contact = card(["VERSION:4.0", "FN:X", "URL:https://example.org/a\\;b"]);
    expect(contact.fields.url).toBe("https://example.org/a;b");
  });
});
