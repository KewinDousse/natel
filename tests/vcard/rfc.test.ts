import { describe, expect, it } from "vitest";
import { parse, serialise, serialiseRaw } from "@/vcard";

const card = (version: string, ...lines: string[]) =>
  [
    "BEGIN:VCARD",
    `VERSION:${version}`,
    "UID:rfc-test",
    "FN:Test",
    "N:Test;;;;",
    ...lines,
    "END:VCARD",
    "",
  ].join("\r\n");
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, "");

describe("RFC 2426 §2.3 and §2.5: vCard 3.0 text escaping", () => {
  it("escapes text semicolons, commas, backslashes and newlines on the wire", () => {
    const contact = parse(card("3.0"));
    contact.fields.note = "a;b,c\\d\ne";
    expect(serialise(contact)).toContain("NOTE:a\\;b\\,c\\\\d\\ne\r\n");
  });

  it("keeps structured and list delimiters separate from escaped text", () => {
    const contact = parse(card("3.0", "CATEGORIES:a\\,b,c\\;d", "ORG:Org\\;name;Unit"));
    contact.fields.n.family = "Fam;ily";
    contact.fields.n.given = "Given";
    const text = unfold(serialise(contact));
    expect(text).toContain("N:Fam\\;ily;Given;;;\r\n");
    expect(text).toContain("CATEGORIES:a\\,b,c\\;d\r\n");
    expect(text).toContain("ORG:Org\\;name;Unit\r\n");
  });

  it("leaves URI semicolons outside text escaping", () => {
    const contact = parse(
      card("3.0", "URL:https://example.org/a;b", "PHOTO;VALUE=URI:https://example.org/a;b.jpg"),
    );
    const text = unfold(serialise(contact));
    expect(text).toContain("URL:https://example.org/a;b\r\n");
    expect(text).toContain("PHOTO;VALUE=URI:https://example.org/a;b.jpg\r\n");
  });

  it("escapes semicolons in a phone-number value (§2.4.3)", () => {
    const text = serialise(parse(card("3.0", "TEL:+41790000000;ext=12")));
    expect(text).toContain("TEL:+41790000000\\;ext=12\r\n");
  });
});

describe("RFC 6350 §3.4: vCard 4.0 text escaping", () => {
  it("writes a text semicolon literally and escapes commas, backslashes and newlines", () => {
    const contact = parse(card("4.0"));
    contact.fields.note = "a;b,c\\d\ne";
    expect(serialise(contact)).toContain("NOTE:a;b\\,c\\\\d\\ne\r\n");
  });
});

describe("RFC 6350 §3.2–3.3: framing and UTF-8 folding", () => {
  it.each(["3.0", "4.0"])("writes CRLF and a final END:VCARD CRLF in %s", (version) => {
    for (const write of [serialise, serialiseRaw]) {
      const contact = parse(card(version));
      contact.fields.fn = "Edited";
      const text = write(contact);
      expect(text.startsWith("BEGIN:VCARD\r\n")).toBe(true);
      expect(text.endsWith("END:VCARD\r\n")).toBe(true);
      expect(text).not.toContain("\r\n\r\n");
      expect(text.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
    }
  });

  it.each(["a", "é", "漢", "😀"])(
    "folds long text containing %s without changing its UTF-8 bytes",
    (character) => {
      const contact = parse(card("4.0"));
      contact.fields.note = `  ${character.repeat(100)}`;
      const text = serialise(contact);
      expect(text).toContain("\r\n ");
      for (const physical of text.split("\r\n")) {
        expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
      }
      // Encoding each physical line exposes a split surrogate pair as replacement bytes.
      const encoded = new TextEncoder().encode(text);
      expect(unfold(new TextDecoder("utf-8", { fatal: true }).decode(encoded))).toContain(
        `NOTE:${contact.fields.note}\r\n`,
      );
    },
  );

  it.each([" ", "\t"])("unfolds exactly one %j continuation character", (space) => {
    expect(parse(card("4.0", `NOTE:one\r\n${space} two`)).fields.note).toBe("one two");
  });
});

describe("text birthday interoperability (outside RFC 2426's BDAY value types)", () => {
  it.each(["3.0", "4.0"])("decodes text once across repeated %s saves", (version) => {
    let text = card(version, "BDAY;VALUE=text:circa\\; 1987\\, perhaps\\nunknown\\\\date");
    for (let save = 0; save < 3; save++) {
      const contact = parse(text);
      expect(contact.fields.bday?.source).toBe("circa; 1987, perhaps\nunknown\\date");
      contact.fields.note = `save ${save}`;
      text = serialise(contact);
      expect(unfold(text)).toContain(
        version === "3.0"
          ? "BDAY;VALUE=TEXT:circa\\; 1987\\, perhaps\\nunknown\\\\date\r\n"
          : "BDAY;VALUE=TEXT:circa; 1987\\, perhaps\\nunknown\\\\date\r\n",
      );
    }
  });
});

describe("RFC 6868 §3: parameter encoding", () => {
  it("keeps caret, newline and quote escapes on an unrelated edit", () => {
    const contact = parse(card("4.0", `X-TEST;X-LABEL="one^^two^nthree^'four":value`));
    expect(contact.raw.getFirstProperty("x-test")?.toJSON()).toEqual(
      expect.arrayContaining([{ "x-label": `one^two\nthree"four` }]),
    );
    contact.fields.note = "edited";
    expect(unfold(serialise(contact))).toContain(`X-TEST;X-LABEL=one^^two^nthree^'four:value\r\n`);
  });
});
