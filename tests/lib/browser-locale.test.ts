/**
 * Tests for src/lib/browser-locale.ts — the browser default of ADR 019.
 */
import { describe, expect, it } from "vitest";
import { browserLocale } from "@/lib/browser-locale";

const LOCALES = ["fr", "en"] as const;

describe("browserLocale", () => {
  it("takes the first supported language by its primary subtag", () => {
    expect(browserLocale(["de-CH", "en-GB", "fr"], LOCALES, "fr")).toBe("en");
    expect(browserLocale(["FR-ch"], LOCALES, "en")).toBe("fr");
  });

  it("falls back when none is supported", () => {
    expect(browserLocale(["de", "it"], LOCALES, "fr")).toBe("fr");
    expect(browserLocale([], LOCALES, "fr")).toBe("fr");
  });
});
