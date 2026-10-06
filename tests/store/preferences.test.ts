/**
 * Tests for src/store/preferences.ts and src/lib/theme.ts — the sort and the
 * theme, display preferences stored like the language (ADR 026).
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PREFERENCES_KEY } from "@/i18n/preferences";
import { applyTheme } from "@/lib/theme";
import { usePreferences } from "@/store/preferences";

function stored(): unknown {
  return JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}");
}

// The system's light or dark, which a test can switch.
let systemDark = false;
const systemListeners: (() => void)[] = [];
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: query.includes("dark") && systemDark,
    media: query,
    addEventListener: (_type: string, listener: () => void) => systemListeners.push(listener),
    removeEventListener: () => {},
  }),
});

function setSystemDark(dark: boolean) {
  systemDark = dark;
  for (const listener of systemListeners) listener();
}

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = `
    <meta name="theme-color" content="#D8261D" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#121316" media="(prefers-color-scheme: dark)">`;
  delete document.documentElement.dataset.theme;
  systemDark = false;
  usePreferences.setState({ sortBy: "given", theme: null });
});

afterEach(() => {
  localStorage.clear();
  applyTheme(null);
});

describe("the list's sort", () => {
  it("stores only the last-name sort, the default being by first name", () => {
    usePreferences.getState().setSortBy("family");
    expect(stored()).toEqual({ sort: "family" });
    usePreferences.getState().setSortBy("given");
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });
});

describe("the theme", () => {
  it("sets the page and the browser bar to the chosen theme, and stores it", () => {
    usePreferences.getState().setTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    const colors = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
      (meta) => meta.content,
    );
    expect(colors).toEqual(["#121316", "#121316"]);
    expect(stored()).toEqual({ theme: "dark" });
  });

  it("hands both back to the system", () => {
    usePreferences.getState().setTheme("light");
    usePreferences.getState().setTheme(null);
    expect(document.documentElement.dataset.theme).toBe("light");
    const colors = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
      (meta) => meta.content,
    );
    expect(colors).toEqual(["#D8261D", "#121316"]);
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });

  it("follows the system while nothing is chosen, and stops once a theme is", () => {
    applyTheme(null);
    setSystemDark(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    setSystemDark(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    usePreferences.getState().setTheme("dark");
    setSystemDark(false);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("is applied before the first paint by public/theme.js, the choice or the system's", () => {
    const script = new Function(readFileSync("public/theme.js", "utf8"));
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ theme: "dark" }));
    script();
    expect(document.documentElement.dataset.theme).toBe("dark");
    const colors = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
      (meta) => meta.content,
    );
    expect(colors).toEqual(["#121316", "#121316"]);
    // Cleared in the settings, the bar goes back to the system's colours.
    usePreferences.getState().setTheme(null);
    const restored = [
      ...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
    ].map((meta) => meta.content);
    expect(restored).toEqual(["#D8261D", "#121316"]);

    localStorage.clear();
    systemDark = true;
    script();
    expect(document.documentElement.dataset.theme).toBe("dark");
    systemDark = false;
    script();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("what the preferences hold", () => {
  it("is display choices only, next to the language", () => {
    usePreferences.getState().setSortBy("family");
    usePreferences.getState().setTheme("light");
    expect(Object.keys(stored() as object).sort()).toEqual(["sort", "theme"]);
  });
});
