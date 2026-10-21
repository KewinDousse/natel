/**
 * Display preferences beside the language (ADR 019): the list's sort, the
 * theme and the map addresses open in (ADR 037). Stored in localStorage like
 * the language, since they say nothing about the account; credentials never
 * go there (invariant 3).
 */
import { create } from "zustand";
import { storeChoice, storedChoice } from "@/i18n/preferences";
import type { SortBy } from "@/lib/contact-list";
import { MAP_APPS, type MapApp } from "@/lib/map-link";
import { chooseTheme, storedTheme, type Theme } from "@/lib/theme";

const SORTS = ["family", "given"] as const satisfies readonly SortBy[];

type PreferencesState = {
  sortBy: SortBy;
  /** An explicit theme, or null for the system's. */
  theme: Theme | null;
  /** An explicit map, or null for the device's. */
  mapApp: MapApp | null;
  setSortBy: (sortBy: SortBy) => void;
  setTheme: (theme: Theme | null) => void;
  setMapApp: (mapApp: MapApp | null) => void;
};

export const usePreferences = create<PreferencesState>()((set) => ({
  sortBy: storedChoice("sort", SORTS) ?? "given",
  theme: storedTheme(),
  mapApp: storedChoice("map", MAP_APPS),
  setSortBy: (sortBy) => {
    // First name first is the default: only the other choice is stored.
    storeChoice("sort", sortBy === "given" ? null : sortBy);
    set({ sortBy });
  },
  setTheme: (theme) => {
    chooseTheme(theme);
    set({ theme });
  },
  setMapApp: (mapApp) => {
    storeChoice("map", mapApp);
    set({ mapApp });
  },
}));
