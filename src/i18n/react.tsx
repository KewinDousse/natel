import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { type Locale, type TranslationKey, translate } from "./setup";

/** Locale used when the browser language matches neither fr nor en. */
const FALLBACK_LOCALE: Locale = "fr";

/** Initial locale from the browser language, French when unrecognized. */
function initialLocale(): Locale {
  const lang = typeof navigator === "undefined" ? "" : navigator.language;
  if (lang.toLowerCase().startsWith("fr")) return "fr";
  if (lang.toLowerCase().startsWith("en")) return "en";
  return FALLBACK_LOCALE;
}

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** In-memory locale state (no persistence) with a t() helper. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the current locale and the t() helper; requires I18nProvider. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
