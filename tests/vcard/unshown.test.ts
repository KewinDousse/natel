/**
 * Tests for unshownPropertiesOf: what the contact page lists under
 * "informations non affichées", read-only.
 */

import { describe, expect, it } from "vitest";
import { parse, serialise, unshownPropertiesOf } from "@/vcard";

const CARD = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:u-unshown",
  "PRODID:-//Example//EN",
  "REV:2026-01-01T00:00:00Z",
  "FN:Ada Lovelace",
  "N:Lovelace;Ada;;;",
  "TEL;TYPE=CELL:+41790000001",
  "TEL;TYPE=WORK:+41210000002",
  "EMAIL:ada@example.org",
  "EMAIL:ada@work.example",
  "ADR;TYPE=HOME:;;Rue du Lac 1;Lausanne;;1000;Suisse",
  "ADR;TYPE=WORK:;;Quai 2;Genève;;1200;Suisse",
  "URL:https://example.org/ada",
  "URL:https://example.org/other",
  "NOTE:Première note",
  "NOTE:Seconde note",
  "CATEGORIES:Famille",
  "CATEGORIES:Club",
  "LOGO;VALUE=uri:https://example.org/logo.png",
  "item1.X-ABLabel:Atelier",
  "X-SOCIALPROFILE;TYPE=mastodon:https://example.org/@ada",
  "END:VCARD",
].join("\r\n");

describe("unshownPropertiesOf", () => {
  it("lists what the page doesn't show, each as its vCard line", () => {
    const lines = unshownPropertiesOf(parse(CARD));
    expect(lines).toHaveLength(5);
    expect(lines).toContain("URL:https://example.org/other");
    expect(lines).toContain("NOTE:Seconde note");
    expect(lines.some((line) => line.startsWith("LOGO"))).toBe(true);
    expect(lines.some((line) => line.toUpperCase().startsWith("ITEM1.X-ABLABEL"))).toBe(true);
    expect(lines.some((line) => line.startsWith("X-SOCIALPROFILE"))).toBe(true);
  });

  it("leaves out what the page shows, every phone, e-mail, address and group included", () => {
    const lines = unshownPropertiesOf(parse(CARD)).join("\n");
    for (const shown of ["TEL", "EMAIL", "ADR", "CATEGORIES", "FN", "N:", "Première"]) {
      expect(lines).not.toContain(shown);
    }
  });

  it("leaves out every photo, which the photo control shows and replaces", () => {
    const card = CARD.replace(
      "END:VCARD",
      "PHOTO;VALUE=uri:https://example.org/a.png\r\nPHOTO;VALUE=uri:https://example.org/b.png\r\nEND:VCARD",
    );
    expect(unshownPropertiesOf(parse(card)).join("\n")).not.toContain("PHOTO");
  });

  it("reads without changing the card", () => {
    const contact = parse(CARD);
    const before = serialise(contact);
    unshownPropertiesOf(contact);
    expect(serialise(contact)).toBe(before);
  });
});
