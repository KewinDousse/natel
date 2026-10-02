/**
 * Tests for the read-only display accessors in src/vcard (additive module:
 * they must never modify `raw` or touch the editable subset).
 */

import { describe, expect, it } from "vitest";
import { orgOf, parse, serialise } from "../../src/vcard";

const CARD_SINGLE_ORG = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:u1",
  "FN:Alice",
  "N:Smith;Alice;;;",
  "ORG:Acme SA",
  "END:VCARD",
].join("\r\n");

const CARD_MULTI_ORG = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "UID:u2",
  "FN:Bob",
  "N:Doe;Bob;;;",
  "ORG:Haut Commandement de Noxus;Espaces verts",
  "END:VCARD",
].join("\r\n");

describe("orgOf", () => {
  it("returns the organisation name for a single-part ORG", () => {
    expect(orgOf(parse(CARD_SINGLE_ORG))).toBe("Acme SA");
  });

  it("joins org units with ', ' for a multi-part ORG", () => {
    expect(orgOf(parse(CARD_MULTI_ORG))).toBe("Haut Commandement de Noxus, Espaces verts");
  });

  it("returns an empty string when ORG is absent", () => {
    const card = CARD_SINGLE_ORG.replace("\r\nORG:Acme SA", "");
    expect(orgOf(parse(card))).toBe("");
  });

  it("never modifies the raw component (read-only)", () => {
    const contact = parse(CARD_MULTI_ORG);
    const before = serialise(contact);
    orgOf(contact);
    expect(serialise(contact)).toBe(before);
  });
});
