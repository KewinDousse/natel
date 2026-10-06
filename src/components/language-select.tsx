/**
 * LanguageSelect — the language preference (ADR 019): the browser's language,
 * or one of `locales` by its own name. A change applies at once and is
 * stored as an explicit choice; "browser language" removes it.
 */

import { LOCALES, useI18n } from "@/i18n/react";
import { type Locale, localeNames } from "@/i18n/setup";

const BROWSER = "browser";

export function LanguageSelect({ id, className }: { id: string; className?: string }) {
  const { choice, setChoice, t } = useI18n();
  return (
    <select
      id={id}
      value={choice ?? BROWSER}
      onChange={(event) => {
        const value = event.target.value;
        setChoice(value === BROWSER ? null : (value as Locale));
      }}
      className={className}
    >
      {/* Explicit colours: some platforms draw the list on the system background. */}
      <option value={BROWSER} className="bg-background text-foreground">
        {t("lang_browser")}
      </option>
      {LOCALES.map((locale) => (
        <option key={locale} value={locale} lang={locale} className="bg-background text-foreground">
          {localeNames[locale]}
        </option>
      ))}
    </select>
  );
}
