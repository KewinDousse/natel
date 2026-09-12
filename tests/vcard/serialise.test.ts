/**
 * Tests for serialise() behaviour — specifically edge cases in applying fields
 * back onto the raw vCard component.
 */
import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { parse, serialise } from "../../src/vcard";

describe("serialise", () => {
  it("creates FN when the card has none", () => {
    // A minimal vCard without FN or N
    const text = ["BEGIN:VCARD", "VERSION:3.0", "UID:no-fn-test@example.com", "END:VCARD"].join(
      "\n",
    );

    const contact = parse(text);
    // No FN/N from the parse; set them via fields.
    contact.fields.fn = "Created Name";
    contact.fields.n = {
      family: "Name",
      given: "Created",
      additional: "",
      prefix: "",
      suffix: "",
    };

    const output = serialise(contact);

    // Output must contain the FN and N properties with the right values.
    const jCal = ICAL.parse(output);
    const comp = new ICAL.Component(jCal);
    expect(String(comp.getFirstPropertyValue("fn") ?? "")).toBe("Created Name");
    const nValue = comp.getFirstPropertyValue("n");
    const nArr = Array.isArray(nValue) ? (nValue as string[]) : [];
    expect(nArr[0]).toBe("Name");
    expect(nArr[1]).toBe("Created");
  });

  it("creates N when the card has none, even with existing FN", () => {
    // A card that has FN but no N (some clients emit this)
    const text = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Only FN",
      "UID:no-n-test@example.com",
      "END:VCARD",
    ].join("\n");

    const contact = parse(text);
    expect(contact.fields.fn).toBe("Only FN");
    // fields.n should be the empty struct (no N property in source)
    expect(contact.fields.n.family).toBe("");
    expect(contact.fields.n.given).toBe("");

    contact.fields.n = { family: "Last", given: "First", additional: "", prefix: "", suffix: "" };

    const output = serialise(contact);

    const jCal = ICAL.parse(output);
    const comp = new ICAL.Component(jCal);
    const nValue = comp.getFirstPropertyValue("n");
    const nArr = Array.isArray(nValue) ? (nValue as string[]) : [];
    expect(nArr[0]).toBe("Last");
    expect(nArr[1]).toBe("First");
  });

  it("clears stale params when TEL list shrinks and reorders", () => {
    // Start with a card that has two TELs with different TYPE params.
    const text = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Test",
      "N:Test;;;",
      "TEL;TYPE=HOME:111",
      "TEL;TYPE=WORK:222",
      "UID:reorder-test@example.com",
      "END:VCARD",
    ].join("\n");

    const contact = parse(text);

    // Delete the HOME TEL (index 0) so the WORK TEL shifts into index 0.
    // The remaining TEL must NOT carry the stale TYPE=HOME.
    contact.fields.tel = [{ value: "222", type: "phone-number", params: { type: "WORK" } }];

    const output = serialise(contact);

    const jCal = ICAL.parse(output);
    const comp = new ICAL.Component(jCal);
    const tels = comp.getAllProperties("tel");
    expect(tels).toHaveLength(1);

    // The single remaining TEL must have TYPE=WORK, not HOME.
    const tel = tels[0]!;
    const jcal = tel.toJSON() as [string, Record<string, string | string[]>, string, unknown];
    const params = jcal[1] ?? {};
    expect(params.type).toBe("WORK");
  });
});
