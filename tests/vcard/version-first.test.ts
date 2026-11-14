/**
 * Tests for a card whose VERSION is not its first property (ADR 054).
 */
import { describe, expect, it } from "vitest";
import { parse, readImportCard, serialise } from "@/vcard";

const text = (lines: string[], eol = "\r\n") =>
  ["BEGIN:VCARD", ...lines, "END:VCARD", ""].join(eol);
const unfold = (card: string) => card.replace(/\r\n[ \t]/g, "");

describe("a card whose VERSION comes later", () => {
  it("keeps every untouched 4.0 property when another field is edited", () => {
    const kept = [
      "GEO:geo:46.5,6.6",
      "SOURCE:https://example.org/a.vcf",
      "URL:https://example.org/?q=1,2",
    ];
    const contact = parse(text(["FN:Ada", "VERSION:4.0", ...kept]));
    contact.fields.fn = "Ada L";
    const saved = unfold(serialise(contact));
    expect(saved.startsWith("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada L\r\n")).toBe(true);
    for (const line of kept) expect(saved).toContain(`\r\n${line}\r\n`);
  });

  it("keeps every untouched 3.0 property when another field is edited", () => {
    const kept = [
      "GEO:46.5;6.6",
      "SOURCE:https://example.org/a.vcf",
      "URL:https://example.org/?q=1,2",
      "NOTE:a\\;b",
    ];
    const contact = parse(text(["FN:Ada", "N:;Ada;;;", "VERSION:3.0", ...kept]));
    contact.fields.fn = "Ada L";
    const saved = unfold(serialise(contact));
    expect(saved.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada L\r\nN:;Ada;;;\r\n")).toBe(true);
    for (const line of kept) expect(saved).toContain(`\r\n${line}\r\n`);
  });

  it.each(["3.0", "4.0"])("saves a %s card as it saves the same card opening with VERSION", (v) => {
    const lines = ["FN:Ada", "TEL:+41 79", "GEO:geo:46.5,6.6", "BDAY:circa 1987"];
    const edit = (card: string) => {
      const contact = parse(card);
      contact.fields.fn = "Ada L";
      contact.fields.tel = [...contact.fields.tel, { value: "+41 78;1,2" }];
      contact.fields.url = "https://example.org/?q=1,2";
      return serialise(contact);
    };
    const [fn, ...rest] = lines;
    expect(edit(text([fn ?? "", `VERSION:${v}`, ...rest]))).toBe(
      edit(text([`VERSION:${v}`, ...lines])),
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

  it("leaves a card without VERSION as it is", () => {
    const names = parse(text(["FN:Ada", "N:;Ada;;;"]))
      .raw.getAllProperties()
      .map((prop) => prop.name);
    expect(names).toEqual(["fn", "n"]);
  });
});
