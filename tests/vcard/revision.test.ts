/**
 * REV moves to the time of each save when the card has one (RFC 6350
 * §6.7.4); a card without one gets none.
 */

import { describe, expect, it } from "vitest";
import { parse, serialiseRaw, stampRevision } from "../../src/vcard";

const NOW = new Date(Date.UTC(2026, 9, 8, 16, 12, 5, 450));

function card(version: string, ...lines: string[]): string {
  return ["BEGIN:VCARD", `VERSION:${version}`, "FN:Rev", ...lines, "END:VCARD", ""].join("\r\n");
}

const revLine = (text: string) => text.split("\r\n").find((line) => line.startsWith("REV"));

describe("stampRevision", () => {
  it.each(["3.0", "4.0"])("moves a %s REV to the save's time, in UTC, to the second", (version) => {
    const contact = parse(card(version, "REV:2026-10-07T21:17:12Z"));
    stampRevision(contact, NOW);
    expect(revLine(serialiseRaw(contact))).toBe("REV:20261008T161205Z");
  });

  it("keeps the REV's other parameters, and drops a VALUE that RFC 6350 doesn't allow", () => {
    const contact = parse(card("4.0", "REV;X-KEEP=yes;VALUE=text:yesterday"));
    stampRevision(contact, NOW);
    expect(revLine(serialiseRaw(contact))).toBe("REV;X-KEEP=yes:20261008T161205Z");
  });

  it("adds none to a card without one", () => {
    const contact = parse(card("3.0"));
    stampRevision(contact, NOW);
    expect(revLine(serialiseRaw(contact))).toBeUndefined();
  });
});
