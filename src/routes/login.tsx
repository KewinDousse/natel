import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { LanguageSelect } from "@/components/language-select";
import { LoginForm } from "@/components/login-form";
import { fieldClass } from "@/components/ui/button";
import { useI18n } from "@/i18n/react";
import { IS_DEMO } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/session";

/**
 * Sign-in screen.
 *
 * Layout and classes come from the design handoff "Sign-in screen" section
 * (natel-design/natel-annuaire-login.html). The red panel is the only place
 * `brand` is allowed to mark position, never action.
 */
export const Route = createFileRoute("/login")({
  // The page to open once signed in: one of the directory's, never another
  // site. An invalid one is overwritten, since the root passes every param on.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? directoryPath(search.redirect) : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (useSessionStore.getState().auth) throw redirect({ href: search.redirect ?? "/contacts" });
  },
  component: LoginRoute,
});

/** `target` resolved, dot segments included, if it is one of the directory's pages. */
function directoryPath(target: string): string | undefined {
  const base = "http://natel.invalid";
  let url: URL;
  try {
    url = new URL(target, base);
  } catch {
    return undefined;
  }
  if (url.origin !== base || !/^\/(?:contacts|settings)(?:\/|$)/.test(url.pathname))
    return undefined;
  return url.pathname + url.search + url.hash;
}

/** Restyle the language select against the red panel (CSS variable overrides). */
const RED_PANEL_LANGUAGE_VARS = {
  "--foreground": "var(--brand-surface-foreground)",
  "--ring": "var(--brand-surface-foreground)",
  "--background": "var(--brand-surface)",
  "--card": "var(--brand-surface)",
  "--input": "var(--brand-surface-foreground)",
} as CSSProperties;

/**
 * Thumb-index tabs on the red panel's edge, as on a paper phone book.
 * Decorative: letters only, no data, not clickable. N–P stands out for Natel.
 */
const INDEX_TABS = ["A–B", "C–D", "E–G", "H–K", "L–M", "N–P", "Q–S", "T–V", "W–Z"];
const CURRENT_TAB = "N–P";

function LoginRoute() {
  const { t } = useI18n();
  const { redirect: next } = Route.useSearch();

  return (
    <div className="min-h-dvh pb-14 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pb-0">
      <aside className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 overflow-hidden bg-brand-surface px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-brand-surface-foreground min-[375px]:pb-5 min-[375px]:pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 lg:min-h-dvh lg:flex-col lg:flex-nowrap lg:items-stretch lg:justify-end lg:gap-10 lg:px-12 lg:py-12">
        <ol className="absolute inset-y-0 right-0 hidden w-13 flex-col lg:flex" aria-hidden="true">
          {INDEX_TABS.map((tab) => (
            <li
              key={tab}
              className={cn(
                "flex flex-1 items-center justify-center border-b border-l border-brand-surface-foreground/35 text-small font-bold last:border-b-0",
                tab === CURRENT_TAB && "bg-brand-surface-foreground text-brand-surface",
              )}
            >
              {tab}
            </li>
          ))}
        </ol>

        {/* On phones the wordmark and the language share one row where they fit, so the form starts high. */}
        <div>
          <p className="hidden max-w-[22rem] text-xl font-bold leading-snug lg:block">
            {t("tagline")}
          </p>
          <p className="font-display text-[3rem] font-bold leading-[0.85] tracking-[-0.01em] min-[375px]:text-[3.5rem] lg:mt-6 lg:text-[clamp(8rem,13vw,13rem)] lg:leading-[0.78]">
            Natel
          </p>
        </div>

        <div className="min-w-0 max-w-full lg:hidden" style={RED_PANEL_LANGUAGE_VARS}>
          <LoginLanguage id="lang-mobile" />
        </div>
      </aside>

      <main className="flex flex-col px-5 sm:px-8 lg:min-h-dvh lg:px-12">
        <div className="hidden justify-end py-8 lg:flex">
          <LoginLanguage id="lang-desktop" />
        </div>
        <div className="h-6 min-[375px]:h-10 lg:hidden" />
        <div className="flex flex-1 items-start justify-center lg:items-center lg:pb-24">
          <div className="w-full max-w-[24rem]">
            <h1 className="font-display text-title-sm font-bold sm:text-title tracking-[-0.005em] text-balance">
              {t("title")}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {t(IS_DEMO ? "lede_demo" : "lede")}
            </p>

            <LoginForm next={next ?? "/contacts"} />
          </div>
        </div>
      </main>
    </div>
  );
}

/** Compact language select: the sign-in screen has no header to reach settings from. */
function LoginLanguage({ id }: { id: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* On phones the select's value says what it is; the label stays for screen readers. */}
      <label htmlFor={id} className="sr-only text-sm font-bold sm:not-sr-only">
        {t("lang_label")}
      </label>
      <LanguageSelect
        id={id}
        wrapperClassName="max-w-full"
        className={fieldClass("h-11 w-auto max-w-full px-2.5 text-sm lg:h-9 lg:text-sm")}
      />
    </div>
  );
}
