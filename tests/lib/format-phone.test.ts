/**
 * Unit tests for src/lib/format-phone.ts — display-only phone formatting.
 * Any parse failure or uncertainty must leave the raw string untouched.
 */

import { describe, expect, it } from "vitest";
import { formatPhone } from "@/lib/format-phone";

describe("formatPhone", () => {
  it("formats Swiss numbers to local format", () => {
    expect(formatPhone("+41790000001", "local")).toBe("079 000 00 01");
    expect(formatPhone("+41 79 000 00 01", "local")).toBe("079 000 00 01");
    expect(formatPhone("079 000 00 01", "local")).toBe("079 000 00 01");
    expect(formatPhone("021 000 00 02", "local")).toBe("021 000 00 02");
    expect(formatPhone("078 000 00 03", "local")).toBe("078 000 00 03");
  });

  it("formats foreign numbers in their own country's local format", () => {
    expect(formatPhone("+12125550166", "local")).toBe("(212) 555-0166");
    expect(formatPhone("+44 20 7946 0958", "local")).toBe("020 7946 0958");
    expect(formatPhone("+33 1 99 00 12 34", "local")).toBe("01 99 00 12 34");
  });

  it("formats numbers with a country code in international format when asked", () => {
    expect(formatPhone("+41790000001", "international")).toBe("+41 79 000 00 01");
    expect(formatPhone("+12125550166", "international")).toBe("+1 212 555 0166");
    expect(formatPhone("+33 1 99 00 12 34", "international")).toBe("+33 1 99 00 12 34");
  });

  it("keeps the country code of a number that belongs to no country", () => {
    expect(formatPhone("+80012345678", "local")).toBe("+800 1234 5678");
    expect(formatPhone("0080012345678", "local")).toBe("+800 1234 5678");
    expect(formatPhone("+80012345678", "international")).toBe("+800 1234 5678");
  });

  it("reads a leading 00 as a country code", () => {
    expect(formatPhone("0041 79 000 00 01", "international")).toBe("+41 79 000 00 01");
    expect(formatPhone("0041 79 000 00 01", "local")).toBe("079 000 00 01");
    expect(formatPhone("0033 1 99 00 12 34", "local")).toBe("01 99 00 12 34");
  });

  it("reads a number stored without a country code as Swiss", () => {
    expect(formatPhone("079 123 45 67", "international")).toBe("+41 79 123 45 67");
    expect(formatPhone("0790000001", "local")).toBe("079 000 00 01");
    expect(formatPhone("abc", "international")).toBe("abc");
  });

  it("returns partial or too-short input untouched", () => {
    expect(formatPhone("079", "local")).toBe("079");
    expect(formatPhone("0793184", "local")).toBe("0793184");
    expect(formatPhone("+41 79", "local")).toBe("+41 79");
    expect(formatPhone("123", "local")).toBe("123");
  });

  it("returns garbage untouched", () => {
    expect(formatPhone("abc", "local")).toBe("abc");
    expect(formatPhone("", "local")).toBe("");
    expect(formatPhone("   ", "local")).toBe("   ");
    expect(formatPhone("079 000 00 01 extra", "local")).toBe("079 000 00 01 extra");
    expect(formatPhone("vcard:+41790000001", "local")).toBe("vcard:+41790000001");
  });
});
