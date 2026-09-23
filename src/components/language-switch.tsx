/**
 * LanguageSwitch — FR/EN pill toggle used by the login screen and the app
 * header. Styling per DESIGN.md "Language switch"; the red login panel
 * restyles it by overriding CSS variables locally.
 */

import { useI18n } from "@/i18n/react";

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <fieldset
      aria-label={t("lang_label")}
      className="m-0 inline-flex items-center gap-0.5 rounded-full border-0 bg-muted p-0.5"
    >
      {(["fr", "en"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={locale === lang}
          onClick={() => setLocale(lang)}
          className="inline-flex h-8 min-w-9 items-center justify-center rounded-full px-2.5 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </fieldset>
  );
}
