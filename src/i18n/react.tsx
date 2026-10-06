import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { browserLocale } from "@/lib/browser-locale";
import { storeChoice, storedChoice } from "./preferences";
import { type Locale, type TranslationKey, translate } from "./setup";

/** Locale used when no browser language is supported. */
const FALLBACK_LOCALE: Locale = "fr";

/** In the order a language select lists them. */
export const LOCALES = ["fr", "en"] as const satisfies readonly Locale[];

/** The locale the browser asks for (ADR 019). */
function localeFromBrowser(): Locale {
  if (typeof navigator === "undefined") return FALLBACK_LOCALE;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return browserLocale(languages, LOCALES, FALLBACK_LOCALE);
}

export interface I18nContextValue {
  locale: Locale;
  /** The user's explicit choice, or null when the browser language applies. */
  choice: Locale | null;
  /** Set an explicit language, or go back to the browser's with null. */
  setChoice: (choice: Locale | null) => void;
  t: (key: TranslationKey, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Locale state: the stored choice, else the browser language. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<Locale | null>(() => storedChoice("locale", LOCALES));
  const value = useMemo<I18nContextValue>(() => {
    const locale = choice ?? localeFromBrowser();
    return {
      locale,
      choice,
      setChoice: (next) => {
        setChoiceState(next);
        storeChoice("locale", next);
      },
      t: (key, vars) => translate(locale, key, vars),
    };
  }, [choice]);
  // Screen readers pick their voice, and browsers their translation offer, from it.
  useEffect(() => {
    document.documentElement.lang = value.locale;
  }, [value.locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Access the current locale and the t() helper; requires I18nProvider. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}
