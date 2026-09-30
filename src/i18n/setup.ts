import en from "./en.json";
import fr from "./fr.json";

export const locales = { en, fr } as const;

export type Locale = keyof typeof locales;

/** Each locale by its own name, as a language select lists it. */
export const localeNames: Record<Locale, string> = { fr: "Français", en: "English" };

/** All translation keys; the en and fr dictionaries must stay in sync. */
export type TranslationKey = keyof typeof locales.fr;

/**
 * Look up a translation key in the given locale, substituting {var}
 * placeholders. Missing keys fall back to French, then to the key itself.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars: Record<string, string> = {},
): string {
  const template = locales[locale][key] ?? locales.fr[key] ?? key;
  let out = template;
  for (const [name, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${name}}`, value);
  }
  return out;
}
