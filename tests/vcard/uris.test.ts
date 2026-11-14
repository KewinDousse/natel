/**
 * Tests for vCard 4.0 uri values, held as written (ADR 053).
 */
import { describe, expect, it } from "vitest";
import { addMember, groupCardOf, parse, serialise } from "@/vcard";

const card = (lines: string[]) => parse(["BEGIN:VCARD", ...lines, "END:VCARD", ""].join("\r\n"));
const unfold = (text: string) => text.replace(/\r\n[ \t]/g, "");

describe("4.0 uri values", () => {
  it("keeps every untouched uri byte for byte when another field is edited", () => {
    const lines = [
      "GEO:geo:46.5,6.6",
      "SOURCE:https://example.org/a\\;b,c",
      "URL:https://example.org/?q=1,2",
      "TEL:tel:+41-79-000-00-00;ext=2",
      "TEL:+41 79 000 00 00\\,123",
      "KEY:data:application/pgp-keys;base64,QUJD",
    ];
    const contact = card(["VERSION:4.0", "FN:X", ...lines]);
    contact.fields.note = "edited";
    const text = unfold(serialise(contact));
    for (const line of lines) expect(text).toContain(`\r\n${line}\r\n`);
  });

  it("shows a uri with its text escapes decoded", () => {
    const contact = card([
      "VERSION:4.0",
      "FN:X",
      "URL:https://example.org/?q=1\\,2",
      "TEL:+41 79 000 00 00\\,123",
    ]);
    expect(contact.fields.url).toBe("https://example.org/?q=1,2");
    expect(contact.fields.urlField?.value).toBe("https://example.org/?q=1,2");
    expect(contact.fields.tel[0]?.value).toBe("+41 79 000 00 00,123");
  });

  it("writes an edited uri with its comma escaped", () => {
    const contact = card(["VERSION:4.0", "FN:X", "URL:https://example.org/", "TEL:+41 79"]);
    contact.fields.url = "https://example.org/?q=1,2";
    const [tel] = contact.fields.tel;
    if (!tel) throw new Error("no TEL");
    contact.fields.tel = [{ ...tel, value: "+41 79,123" }];
    const text = unfold(serialise(contact));
    expect(text).toContain("\r\nURL:https://example.org/?q=1\\,2\r\n");
    expect(text).toContain("\r\nTEL:+41 79\\,123\r\n");
    expect(contact.fields.url).toBe("https://example.org/?q=1,2");
  });

  it("writes a new phone number with its comma escaped, whatever its draft type", () => {
    for (const type of [undefined, ""]) {
      const contact = card(["VERSION:4.0", "FN:X"]);
      contact.fields.tel = [{ value: "+41 79,123", type }];
      expect(unfold(serialise(contact))).toContain("\r\nTEL:+41 79\\,123\r\n");
    }
  });

  it("writes a new member of a 4.0 group card with its escapes", () => {
    const contact = card(["VERSION:4.0", "KIND:group", "FN:Team", "UID:team"]);
    addMember(contact, "a,b\\c");
    expect(unfold(contact.raw.toString())).toContain("\r\nMEMBER:urn:uuid:a\\,b\\\\c");
    expect(groupCardOf(contact).members).toEqual(["a,b\\c"]);
  });

  it("shows a versionless card's URL decoded and keeps it as written", () => {
    const contact = card(["FN:X", "URL:https://example.org/?q=1\\,2"]);
    expect(contact.fields.url).toBe("https://example.org/?q=1,2");
    contact.fields.note = "edited";
    expect(unfold(serialise(contact))).toContain("\r\nURL:https://example.org/?q=1\\,2\r\n");
  });

  it("writes a phone number with its escapes once one before it is removed", () => {
    const contact = card(["VERSION:4.0", "FN:X", "TEL:tel:+41-1", "TEL:tel:+41-2,3"]);
    contact.fields.tel = contact.fields.tel.slice(1);
    expect(unfold(serialise(contact))).toContain("\r\nTEL:tel:+41-2\\,3\r\n");
  });

  it("reads a group card's member with its escapes decoded, and keeps it as written", () => {
    const contact = card([
      "VERSION:4.0",
      "KIND:group",
      "FN:Team",
      "UID:team",
      "MEMBER:urn:uuid:a\\,b",
    ]);
    expect(groupCardOf(contact).members).toEqual(["a,b"]);
    contact.fields.note = "edited";
    expect(unfold(serialise(contact))).toContain("\r\nMEMBER:urn:uuid:a\\,b\r\n");
  });

  it("leaves a 3.0 URL as written, escapes included", () => {
    const contact = card(["VERSION:3.0", "FN:X", "URL:https://example.org/?q=1\\,2"]);
    expect(contact.fields.url).toBe("https://example.org/?q=1\\,2");
    contact.fields.note = "edited";
    expect(unfold(serialise(contact))).toContain("\r\nURL:https://example.org/?q=1\\,2\r\n");
  });
});
