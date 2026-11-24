/**
 * Display preferences beside the language (ADR 019): the list's sort, the
 * theme, the map addresses open in (ADR 037) and the phone number format.
 * Stored in localStorage like the language, since they say nothing about the
 * account; credentials never go there (invariant 3).
 */
import { create } from "zustand";
import { storeChoice, storedChoice } from "@/i18n/preferences";
import type { SortBy } from "@/lib/contact-list";
import type { PhoneFormat } from "@/lib/format-phone";
import { MAP_APPS, type MapApp } from "@/lib/map-link";
import { chooseTheme, storedTheme, type Theme } from "@/lib/theme";

const SORTS = ["family", "given"] as const satisfies readonly SortBy[];

export type LabelPosition = "auto" | "left" | "above";
const LABEL_POSITIONS = ["left", "above"] as const;

export type AvatarShape = "round" | "square";
const AVATAR_SHAPES = ["round", "square"] as const;

const CARD_DATES = ["shown"] as const;
const PHONE_FORMATS = ["international"] as const satisfies readonly PhoneFormat[];

type PreferencesState = {
  avatarShape: AvatarShape;
  setAvatarShape: (shape: AvatarShape) => void;
  /** Whether a contact page shows when its card was created and modified. */
  showCardDates: boolean;
  setShowCardDates: (show: boolean) => void;
  labelPosition: LabelPosition;
  setLabelPosition: (position: LabelPosition) => void;
  phoneFormat: PhoneFormat;
  setPhoneFormat: (format: PhoneFormat) => void;
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
  phoneFormat: storedChoice("phoneFormat", PHONE_FORMATS) ?? "local",
  setPhoneFormat: (phoneFormat) => {
    storeChoice("phoneFormat", phoneFormat === "local" ? null : phoneFormat);
    set({ phoneFormat });
  },
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
