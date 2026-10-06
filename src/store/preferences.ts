/**
 * Display preferences beside the language (ADR 019): the list's sort and the
 * theme. Stored in localStorage like the language, since they say nothing
 * about the account; credentials never go there (invariant 3).
 */
import { create } from "zustand";
import { storeChoice, storedChoice } from "@/i18n/preferences";
import type { SortBy } from "@/lib/contact-list";
import { chooseTheme, storedTheme, type Theme } from "@/lib/theme";

const SORTS = ["family", "given"] as const satisfies readonly SortBy[];

type PreferencesState = {
  sortBy: SortBy;
  /** An explicit theme, or null for the system's. */
  theme: Theme | null;
  setSortBy: (sortBy: SortBy) => void;
  setTheme: (theme: Theme | null) => void;
};

export const usePreferences = create<PreferencesState>()((set) => ({
  sortBy: storedChoice("sort", SORTS) ?? "given",
  theme: storedTheme(),
  setSortBy: (sortBy) => {
    // First name first is the default: only the other choice is stored.
    storeChoice("sort", sortBy === "given" ? null : sortBy);
    set({ sortBy });
  },
  setTheme: (theme) => {
    chooseTheme(theme);
    set({ theme });
  },
}));
