/**
 * Tests for vCard 3.0 TZ and GEO values, held as written (ADR 060 and 061).
 */
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { parse, serialise, unshownPropertiesOf } from "@/vcard";

const card = (lines: string[]) =>
  parse(["BEGIN:VCARD", "VERSION:3.0", "FN:X", ...lines, "END:VCARD", ""].join("\r\n"));

describe("3.0 TZ and GEO values", () => {
  const lines = [
    "TZ:Europe/Zurich",
    "TZ:-05:00",
    "TZ;VALUE=TEXT:America/New_York",
    "GEO:geo:46.5,6.6",
    "GEO:46.5;6.6",
    "GEO:46.5,6.6",
    "GEO;X-P=1:-33.85;151.2",
    "GEO:46.50;6.60",
    "X-WEIGHT;VALUE=FLOAT:1.50",
  ];

  it("keeps every untouched value as written when another field is edited", () => {
    const contact = card(lines);
    contact.fields.note = "edited";
    const text = serialise(contact);
    for (const line of lines) expect(text).toContain(`\r\n${line}\r\n`);
  });

  it("lists them as written among the card's unshown properties", () => {
    const unshown = ["TZ:Europe/Zurich", "GEO:geo:46.5,6.6", "GEO:46.50;6.60"];
    expect(unshownPropertiesOf(card(unshown))).toEqual(unshown);
  });

  it("leaves the 4.0 and iCalendar utc-offset codecs as they are", () => {
    expect(ICAL.design.vcard.value["utc-offset"]?.toICAL("+02:00")).toBe("+0200");
    expect(ICAL.design.icalendar.value["utc-offset"]?.toICAL("+02:00")).toBe("+0200");
  });
});
