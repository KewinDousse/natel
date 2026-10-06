/**
 * Light or dark (ADR 026): the system's setting unless the settings choose
 * one. The page's palette follows data-theme on <html>, always set: public/
 * theme.js sets it before the first paint, this module afterwards, and it
 * follows the system when no choice is stored.
 */

import { storeChoice, storedChoice } from "@/i18n/preferences";

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The browser bar's colour per theme, as index.html and public/theme.js give it. */
const THEME_COLORS: Record<Theme, string> = { light: "#D8261D", dark: "#121316" };

const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/** The explicit choice, null while the system decides. */
let chosen: Theme | null = null;
let watching = false;

export function storedTheme(): Theme | null {
  return storedChoice("theme", THEMES);
}

function systemTheme(): Theme {
  return window.matchMedia?.(SYSTEM_DARK).matches ? "dark" : "light";
}

/** Sets the theme on the page, or hands it back to the system with null. */
export function applyTheme(theme: Theme | null): void {
  chosen = theme;
  document.documentElement.dataset.theme = theme ?? systemTheme();
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const system = meta.dataset.system ?? meta.content;
    meta.dataset.system = system;
    meta.content = theme === null ? system : THEME_COLORS[theme];
  }
  if (!watching && typeof window.matchMedia === "function") {
    watching = true;
    window.matchMedia(SYSTEM_DARK).addEventListener?.("change", () => {
      if (chosen === null) document.documentElement.dataset.theme = systemTheme();
    });
  }
}

export function chooseTheme(theme: Theme | null): void {
  storeChoice("theme", theme);
  applyTheme(theme);
}
