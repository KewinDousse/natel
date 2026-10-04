import { describe, expect, it } from "vitest";
import { formatMegabytes } from "@/lib/format-size";

describe("formatMegabytes", () => {
  it("counts in MiB, with one decimal, in the locale's words", () => {
    expect(formatMegabytes(7_000_000, "en")).toBe("6.7 MB");
    expect(formatMegabytes(7_000_000, "fr")).toMatch(/^6,7\s?Mo$/);
  });

  it("rounds up, so a card just over a limit never reads as the limit", () => {
    expect(formatMegabytes(5 * 1024 * 1024, "en")).toBe("5 MB");
    expect(formatMegabytes(1024 * 1024 + 30_000, "en")).toBe("1.1 MB");
  });
});
