/**
 * Pure side of the display preferences (ADR 019): the default each
 * preference takes from the browser. Storage, which isn't pure, lives in
 * src/i18n/preferences.ts.
 */

/** The first browser language whose primary subtag is supported, else `fallback`. */
export function browserLocale<L extends string>(
  languages: readonly string[],
  supported: readonly L[],
  fallback: L,
): L {
  for (const language of languages) {
    const primary = language.split("-")[0]?.toLowerCase();
    const match = supported.find((locale) => locale === primary);
    if (match) return match;
  }
  return fallback;
}
