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
});
