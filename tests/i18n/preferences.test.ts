/**
 * Tests for src/i18n/preferences.ts — the stored choices of ADR 019.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { PREFERENCES_KEY, storeChoice, storedChoice } from "@/i18n/preferences";

const LOCALES = ["fr", "en"] as const;

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("stored choices", () => {
  it("stores only explicit choices, and removes the key once empty", () => {
    storeChoice("locale", "en");
    expect(localStorage.getItem(PREFERENCES_KEY)).toBe('{"locale":"en"}');
    expect(storedChoice("locale", LOCALES)).toBe("en");
    storeChoice("locale", null);
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });

  it("keeps fields it doesn't know", () => {
    localStorage.setItem(PREFERENCES_KEY, '{"dates":"iso","x":1}');
    storeChoice("locale", "fr");
    expect(JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "")).toEqual({
      dates: "iso",
      x: 1,
      locale: "fr",
    });
  });

  it("reads an unsupported value as absent", () => {
    localStorage.setItem(PREFERENCES_KEY, '{"locale":"de"}');
    expect(storedChoice("locale", LOCALES)).toBeNull();
  });

  it("reads anything but a JSON object as empty, and overwrites it", () => {
    for (const junk of ["not json", "[1]", "null", '"en"']) {
      localStorage.setItem(PREFERENCES_KEY, junk);
      expect(storedChoice("locale", LOCALES)).toBeNull();
    }
    storeChoice("locale", "en");
    expect(localStorage.getItem(PREFERENCES_KEY)).toBe('{"locale":"en"}');
  });

  it("keeps working when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(storedChoice("locale", LOCALES)).toBeNull();
    expect(() => storeChoice("locale", "en")).not.toThrow();
  });
});

describe("LOCALES", () => {
  it("lists every locale, so a new translation shows up in the selects", async () => {
    const { LOCALES } = await import("@/i18n/react");
    const { locales } = await import("@/i18n/setup");
    expect([...LOCALES].sort()).toEqual(Object.keys(locales).sort());
  });
});
