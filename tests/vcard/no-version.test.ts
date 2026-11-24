/**
 * Tests for a card that doesn't open with VERSION 3.0 or 4.0 (ADR 062).
 */
import { describe, expect, it } from "vitest";
import { addMember, parse, readImportCard, serialise, stampRevision } from "@/vcard";

const text = (lines: string[]) => ["BEGIN:VCARD", ...lines, "END:VCARD", ""].join("\r\n");
const unfold = (card: string) => card.replace(/\r\n[ \t]/g, "");

const untouched = [
  "GEO:geo:46.5,6.6",
  "GEO:46.5;6.6",
  "SOURCE:https://example.org/a.vcf",
  "TEL:+41 79",
  "BDAY:19870101",
  "ANNIVERSARY:circa 1987",
  "TZ:-05:00",
  "TZ:-0500",
  "TZ:Europe/Zurich",
  "IMPP:xmpp:ada@example.org",
  "PHOTO;ENCODING=b;TYPE=PNG:AAAA",
];

describe.each([
  ["without VERSION", "", []],
  ["with VERSION:2.1", "", ["VERSION:2.1"]],
  ["with a grouped VERSION:4.0", "", ["ITEM1.VERSION:4.0"]],
  ["after an empty line", "\r\n", []],
])("a card %s", (_, before, version) => {
  it("keeps every property an edit leaves alone", () => {
    const contact = parse(before + text([...version, "UID:x", "FN:A", ...untouched]));
    contact.fields.org = "Acme";
    const saved = unfold(serialise(contact));
    const opening = ["BEGIN:VCARD", ...version, "UID:x", "FN:A", ""].join("\r\n");
    expect(saved.startsWith(opening)).toBe(true);
    for (const line of untouched) expect(saved).toContain(`\r\n${line}\r\n`);
    expect(saved).toContain("\r\nORG:Acme\r\n");
  });

  it("shows and keeps a note with an unescaped comma in full", () => {
    const contact = parse(before + text([...version, "FN:A", "NOTE:hello, world"]));
    expect(contact.fields.note).toBe("hello, world");
    contact.fields.org = "Acme";
    expect(serialise(contact)).toContain("\r\nNOTE:hello\\, world\r\n");
  });

  it("keeps a note with an unescaped comma whole after a nested card", () => {
    const agent = ["AGENT:", "BEGIN:VCARD", "VERSION:2.1", "FN:B", "END:VCARD"];
    const lines = [...version, "FN:A", ...agent, "NOTE:hello, world", "NOTE;VALUE=integer:1,2"];
    const contact = parse(before + text(lines));
    expect(contact.fields.note).toBe("hello, world");
    contact.fields.org = "Acme";
    const saved = serialise(contact);
    expect(saved).toContain("\r\nNOTE:hello\\, world\r\n");
    expect(saved).toContain("\r\nNOTE;VALUE=INTEGER:1,2\r\n");
  });

  it("keeps a float GEO's two values", () => {
    const contact = parse(before + text([...version, "FN:A", "GEO;VALUE=float:46.5;6.6"]));
    contact.fields.org = "Acme";
    // Any 4.0 card gets the parameter value upper-cased, which RFC 6350 reads alike.
    expect(unfold(serialise(contact))).toMatch(/\r\nGEO;VALUE=float:46\.5;6\.6\r\n/i);
  });
});

it("keeps a 4.0 card's note with an unescaped comma whole after a nested card", () => {
  const agent = ["AGENT:", "BEGIN:VCARD", "VERSION:2.1", "FN:B", "END:VCARD"];
  const contact = parse(text(["VERSION:4.0", "FN:A", ...agent, "NOTE:hello, world"]));
  expect(contact.fields.note).toBe("hello, world");
  contact.fields.org = "Acme";
  expect(serialise(contact)).toContain("\r\nNOTE:hello\\, world\r\n");
});

it("keeps the properties of a card whose VERSION:2.1 comes later", () => {
  const contact = parse(text(["FN:A", "VERSION:2.1", ...untouched]));
  contact.fields.org = "Acme";
  const saved = unfold(serialise(contact));
  expect(saved.startsWith("BEGIN:VCARD\r\nVERSION:2.1\r\nFN:A\r\n")).toBe(true);
  for (const line of untouched) expect(saved).toContain(`\r\n${line}\r\n`);
});

const blankAfterBegin = (version: string[], blank: string) =>
  text([...version, "FN:A"]).replace("VCARD\r\n", `VCARD${blank}\r\n`);

it.each([
  ["a calendar", "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n"],
  ["two cards", text(["FN:A"]) + text(["FN:B"])],
  ...[" ", "\t"].flatMap((blank) =>
    [[], ["VERSION:3.0"], ["VERSION:4.0"]].map((version): [string, string] => [
      `a card with ${JSON.stringify(blank)} after BEGIN:VCARD and ${version[0] ?? "no VERSION"}`,
      blankAfterBegin(version, blank),
    ]),
  ),
])("rejects %s rather than reading it as a contact", (_, notOneCard) => {
  expect(() => parse(notOneCard)).toThrow();
  expect(() => readImportCard(notOneCard)).toThrow();
});

describe("a card without VERSION", () => {
  it("reads every property as it reads the first", () => {
    const first = parse(text(["GEO:geo:46.5,6.6", "FN:A"]));
    const later = parse(text(["FN:A", "GEO:geo:46.5,6.6"]));
    expect(later.raw.getFirstPropertyValue("geo")).toBe(first.raw.getFirstPropertyValue("geo"));
  });

  it("writes untouched properties and edited names, phones and URLs as with VERSION:4.0", () => {
    const edit = (card: string) => {
      const contact = parse(card);
      contact.fields.fn = "Ada L";
      contact.fields.tel = [...contact.fields.tel, { value: "+41 78;1,2" }];
      contact.fields.url = "https://example.org/?q=1,2";
      return serialise(contact);
    };
    const rest = ["FN:Ada", ...untouched, "NOTE:a\\;b", "BDAY:circa 1987"];
    expect(edit(text(rest))).toBe(
      edit(text(["VERSION:4.0", ...rest])).replace("\r\nVERSION:4.0\r\n", "\r\n"),
    );
  });

  it("gains no VERSION property", () => {
    const contact = parse(text(["FN:Ada", "GEO:geo:46.5,6.6"]));
    expect(contact.raw.getAllProperties().map((prop) => prop.name)).toEqual(["fn", "geo"]);
  });

  it("keeps the 3.0 forms of the REV stamp and of an edited birthday", () => {
    const contact = parse(text(["FN:Ada", "REV:20200101T000000Z", "BDAY:19870101"]));
    contact.fields.bday = { source: "", year: 1990, month: 5, day: 6 };
    stampRevision(contact, new Date("2026-11-17T10:00:00Z"));
    const saved = serialise(contact);
    expect(saved).toContain("\r\nREV;VALUE=DATE-TIME:20261117T100000Z\r\n");
    expect(saved).toContain("\r\nBDAY;VALUE=DATE:19900506\r\n");
  });

  it("adds a group member with the 3.0 property", () => {
    const group = parse(text(["UID:g", "FN:Club", "X-ADDRESSBOOKSERVER-KIND:group"]));
    addMember(group, "ada");
    expect(serialise(group)).toContain("\r\nX-ADDRESSBOOKSERVER-MEMBER:urn:uuid:ada\r\n");
  });

  it("keeps untouched properties when its lines end with LF alone", () => {
    const contact = parse(text(["FN:A", ...untouched]).replaceAll("\r\n", "\n"));
    contact.fields.org = "Acme";
    const saved = unfold(serialise(contact));
    for (const line of untouched) expect(saved).toContain(`\r\n${line}\r\n`);
  });
});
