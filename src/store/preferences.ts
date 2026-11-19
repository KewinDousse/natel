/**
 * Display preferences beside the language (ADR 019), the map addresses open
 * in among them (ADR 037). Stored in localStorage like the language, since
 * they say nothing about the account; credentials never go there
 * (invariant 3).
 */
import { create } from "zustand";
import { storeChoice, storedChoice } from "@/i18n/preferences";
import type { ListSort, SortBy } from "@/lib/contact-list";
import { MAP_APPS, type MapApp } from "@/lib/map-link";
import { chooseTheme, storedTheme, type Theme } from "@/lib/theme";

const SORTS = ["family", "given"] as const satisfies readonly SortBy[];
const ORDERS = ["edited"] as const;

export type LabelPosition = "auto" | "left" | "above";
const LABEL_POSITIONS = ["left", "above"] as const;

export type AvatarShape = "round" | "square";
const AVATAR_SHAPES = ["round", "square"] as const;

const CARD_DATES = ["shown"] as const;

type PreferencesState = {
  avatarShape: AvatarShape;
  setAvatarShape: (shape: AvatarShape) => void;
  /** Whether a contact page shows when its card was created and modified. */
  showCardDates: boolean;
  setShowCardDates: (show: boolean) => void;
  labelPosition: LabelPosition;
  setLabelPosition: (position: LabelPosition) => void;
  /** The order of names, and the list's sort unless `byRevision`. */
  sortBy: SortBy;
  /** Whether the list sorts by last modification. */
  byRevision: boolean;
  /** An explicit theme, or null for the system's. */
  theme: Theme | null;
  /** An explicit map, or null for the device's. */
  mapApp: MapApp | null;
  setSortBy: (sort: ListSort) => void;
  setTheme: (theme: Theme | null) => void;
  setMapApp: (mapApp: MapApp | null) => void;
};

export const usePreferences = create<PreferencesState>()((set) => ({
  avatarShape: storedChoice("avatarShape", AVATAR_SHAPES) ?? "round",
  setAvatarShape: (avatarShape) => {
    storeChoice("avatarShape", avatarShape === "round" ? null : avatarShape);
    set({ avatarShape });
  },
  showCardDates: storedChoice("cardDates", CARD_DATES) === "shown",
  setShowCardDates: (showCardDates) => {
    storeChoice("cardDates", showCardDates ? "shown" : null);
    set({ showCardDates });
  },
  labelPosition: storedChoice("labelPosition", LABEL_POSITIONS) ?? "auto",
  setLabelPosition: (labelPosition) => {
    storeChoice("labelPosition", labelPosition === "auto" ? null : labelPosition);
    set({ labelPosition });
  },
  sortBy: storedChoice("sort", SORTS) ?? "given",
  byRevision: storedChoice("order", ORDERS) !== null,
  theme: storedTheme(),
  mapApp: storedChoice("map", MAP_APPS),
  setSortBy: (sort) => {
    if (sort === "edited") {
      // The names keep the order of the last sort by name.
      storeChoice("order", sort);
      set({ byRevision: true });
      return;
    }
    // First name first is the default: only the other choice is stored.
    storeChoice("order", null);
    storeChoice("sort", sort === "given" ? null : sort);
    set({ sortBy: sort, byRevision: false });
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
