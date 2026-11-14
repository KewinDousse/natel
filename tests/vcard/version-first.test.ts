/**
 * Tests for a card whose VERSION is not its first property (ADR 054).
 */
import { describe, expect, it } from "vitest";
import { parse, readImportCard, serialise } from "@/vcard";

const text = (lines: string[], eol = "\r\n") =>
  ["BEGIN:VCARD", ...lines, "END:VCARD", ""].join(eol);
const unfold = (card: string) => card.replace(/\r\n[ \t]/g, "");

describe("a card whose VERSION comes later", () => {
  it.each([
    [
      "4.0",
      [],
      ["GEO:geo:46.5,6.6", "SOURCE:https://example.org/a.vcf", "URL:https://example.org/?q=1,2"],
    ],
    [
      "3.0",
      ["N:;Ada;;;"],
      [
        "GEO:46.5;6.6",
        "SOURCE:https://example.org/a.vcf",
        "URL:https://example.org/?q=1,2",
        "NOTE:a\\;b",
      ],
    ],
  ])("keeps every untouched %s property when another field is edited", (v, before, kept) => {
    const contact = parse(text(["FN:Ada", ...before, `VERSION:${v}`, ...kept]));
    contact.fields.fn = "Ada L";
    const saved = unfold(serialise(contact));
    const opening = ["BEGIN:VCARD", `VERSION:${v}`, "FN:Ada L", ...before, ""].join("\r\n");
    expect(saved.startsWith(opening)).toBe(true);
    for (const line of kept) expect(saved).toContain(`\r\n${line}\r\n`);
  });

  it.each(["3.0", "4.0"])("saves a %s card as it saves the same card opening with VERSION", (v) => {
    const rest = ["TEL:+41 79", "GEO:geo:46.5,6.6", "BDAY:circa 1987"];
    const edit = (card: string) => {
      const contact = parse(card);
      contact.fields.fn = "Ada L";
      contact.fields.tel = [...contact.fields.tel, { value: "+41 78;1,2" }];
      contact.fields.url = "https://example.org/?q=1,2";
      return serialise(contact);
    };
    expect(edit(text(["FN:Ada", `VERSION:${v}`, ...rest]))).toBe(
      edit(text([`VERSION:${v}`, "FN:Ada", ...rest])),
    );
  });

  it("moves a VERSION line found after a folded line, with LF line endings", () => {
    const note = `NOTE:${"x".repeat(80)}`;
    const folded = `${note.slice(0, 75)}\n ${note.slice(75)}`;
    const contact = parse(text(["FN:Ada", folded, "VERSION:4.0", "GEO:geo:46.5,6.6"], "\n"));
    expect(contact.fields.note).toBe("x".repeat(80));
    contact.fields.fn = "Ada L";
    const saved = unfold(serialise(contact));
    expect(saved.startsWith("BEGIN:VCARD\r\nVERSION:4.0\r\n")).toBe(true);
    expect(saved).toContain("\r\nGEO:geo:46.5,6.6\r\n");
  });

  it.each([
    ["mixed line endings", "BEGIN:VCARD\r\nFN:Ada\nVERSION:4.0\r\nEND:VCARD\r\n"],
    ["no line ending after END:VCARD", "BEGIN:VCARD\r\nFN:Ada\r\nVERSION:4.0\r\nEND:VCARD"],
    ["a parameter", "BEGIN:VCARD\r\nFN:Ada\r\nVERSION;X-A=1:4.0\r\nEND:VCARD\r\n"],
    ["a fold inside its name", "BEGIN:VCARD\r\nFN:Ada\r\nVERS\r\n ION:4.0\r\nEND:VCARD\r\n"],
    ["a folded END:VCARD", "BEGIN:VCARD\r\nFN:Ada\r\nVERSION:4.0\r\nEND:VC\r\n ARD\r\n"],
    [
      "BEGIN and END as properties",
      "BEGIN:VCARD\r\nFN:Ada\r\nBEGIN;X-A=1:a\r\nEND;X-A=1:b\r\nVERSION:4.0\r\nEND:VCARD\r\n",
    ],
    ["VERSION already first", "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada\r\nEND:VCARD\r\n"],
  ])("reads the VERSION line first, with %s", (_, card) => {
    const [first, second] = parse(card).raw.getAllProperties();
    expect([first?.name, first?.getFirstValue(), second?.name]).toEqual(["version", "4.0", "fn"]);
  });

  it("keeps a bare CR inside its line, as ical.js reads it", () => {
    const card = "BEGIN:VCARD\r\nFN:Ada\r\nNOTE:a\r\rVERSION:4.0\r\nEND:VCARD\r\n";
    const props = parse(card).raw.getAllProperties();
    expect(props.map((prop) => prop.name)).toEqual(["fn", "note"]);
    expect(props[1]?.getFirstValue()).toBe("a\r\rVERSION:4.0");
  });

  it("reads the same UID on import as when opening the card", () => {
    const card = text(["FN:Ada", "VERSION:4.0", "UID:urn:uuid:a\\,b"]);
    expect(readImportCard(card).uid).toBe(parse(card).raw.getFirstPropertyValue("uid"));
  });

  it("moves VERSION after spaces before BEGIN:VCARD", () => {
    const contact = parse(`  ${text(["FN:Ada", "VERSION:4.0", "GEO:geo:46.5,6.6"])}`);
    contact.fields.fn = "Ada L";
    expect(unfold(serialise(contact))).toContain("\r\nGEO:geo:46.5,6.6\r\n");
  });

  it.each([
    [
      "an AGENT card",
      ["AGENT:", "BEGIN:VCARD", "FN:Bob", "VERSION:2.1", "END:VCARD"],
      "\r\nBEGIN:VCARD\r\nFN:Bob\r\nVERSION:2.1\r\nEND:VCARD\r\n",
    ],
    [
      "an AGENT card with a folded BEGIN",
      ["AGENT:", "BEGIN:VC\r\n ARD", "FN:Bob", "VERSION:2.1", "END:VCARD"],
      "\r\nBEGIN:VCARD\r\nFN:Bob\r\nVERSION:2.1\r\nEND:VCARD\r\n",
    ],
    [
      "another component",
      ["BEGIN:X-A", "VERSION:9", "END:X-A"],
      "\r\nBEGIN:X-A\r\nVERSION:9\r\nEND:X-A\r\n",
    ],
    [
      "a component after an empty line and a fold",
      ["", " BEGIN:X-A", "VERSION:9", "END:X-A"],
      "\r\nBEGIN:X-A\r\nVERSION:9\r\nEND:X-A\r\n",
    ],
  ])("moves the card's own VERSION, not that of %s nested in it", (_, nest, kept) => {
    const contact = parse(text(["FN:Ada", ...nest, "VERSION:3.0"]));
    contact.fields.fn = "Ada L";
    const saved = unfold(serialise(contact));
    expect(saved.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada L\r\n")).toBe(true);
    expect(saved).toContain(kept);
  });

  it("leaves a card without VERSION as it is", () => {
    const names = parse(text(["FN:Ada", "N:;Ada;;;"]))
      .raw.getAllProperties()
      .map((prop) => prop.name);
    expect(names).toEqual(["fn", "n"]);
  });
});
