/**
 * Unit tests for src/lib/format-phone.ts — display-only phone formatting.
 * Any parse failure or uncertainty must leave the raw string untouched.
 */

import { describe, expect, it } from "vitest";
import { formatPhone } from "@/lib/format-phone";

describe("formatPhone", () => {
  it("formats Swiss numbers to local format", () => {
    expect(formatPhone("+41790000001")).toBe("079 000 00 01");
    expect(formatPhone("+41 79 000 00 01")).toBe("079 000 00 01");
    expect(formatPhone("079 000 00 01")).toBe("079 000 00 01");
    expect(formatPhone("021 000 00 02")).toBe("021 000 00 02");
    expect(formatPhone("078 000 00 03")).toBe("078 000 00 03");
  });

  it("formats foreign numbers in international format", () => {
    expect(formatPhone("+12125550166")).toBe("+1 212 555 0166");
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("+33 1 99 00 12 34")).toBe("+33 1 99 00 12 34");
  });

  it("returns partial or too-short input untouched", () => {
    expect(formatPhone("079")).toBe("079");
    expect(formatPhone("0793184")).toBe("0793184");
    expect(formatPhone("+41 79")).toBe("+41 79");
    expect(formatPhone("123")).toBe("123");
  });

  it("returns garbage untouched", () => {
    expect(formatPhone("abc")).toBe("abc");
    expect(formatPhone("")).toBe("");
    expect(formatPhone("   ")).toBe("   ");
    expect(formatPhone("079 000 00 01 extra")).toBe("079 000 00 01 extra");
    expect(formatPhone("vcard:+41790000001")).toBe("vcard:+41790000001");
  });
});
