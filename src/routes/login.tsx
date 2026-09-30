import { createFileRoute, redirect } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { LanguageSelect } from "@/components/language-select";
import { LoginForm } from "@/components/login-form";
import { useI18n } from "@/i18n/react";
import { useSessionStore } from "@/store/session";

/**
 * Sign-in screen — first screen of Phase 2.
 *
 * Layout and classes come from the design handoff "Sign-in screen" section
 * (natel-design/natel-annuaire-login.html). The red panel is the only place
 * `brand` is allowed to mark position, never action.
 */
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (useSessionStore.getState().auth) throw redirect({ to: "/contacts" });
  },
  component: LoginRoute,
});

/** Decorative directory excerpt on the red panel (not clickable). */
const DIRECTORY_EXCERPT: Array<{ family: string; given: string; tel: string }> = [
  { family: "Favre", given: "Aurélien", tel: "079 412 58 03" },
  { family: "Haddad", given: "Amina", tel: "079 204 18 33" },
  { family: "Pasche", given: "Camille", tel: "076 205 91 14" },
  { family: "Rochat", given: "Chloé", tel: "079 877 40 12" },
];

/** Restyle the language select against the red panel (CSS variable overrides). */
const RED_PANEL_LANGUAGE_VARS = {
  "--foreground": "var(--brand-surface-foreground)",
  "--ring": "var(--brand-surface-foreground)",
  "--background": "var(--brand-surface)",
  "--card": "var(--brand-surface)",
  "--input": "var(--brand-surface-foreground)",
} as CSSProperties;

/** Dotted-leader colour on the red panel. */
const RED_PANEL_LEADER_VARS = {
  "--leader": "color-mix(in oklab, var(--brand-surface-foreground) 45%, transparent)",
} as CSSProperties;

function LoginRoute() {
  const { t } = useI18n();

  return (
    <div className="min-h-dvh pb-14 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pb-0">
      <aside
        className="relative flex flex-col justify-between gap-6 overflow-hidden bg-brand-surface px-5 pb-7 lg:gap-10 pt-[max(1.25rem,env(safe-area-inset-top))] text-brand-surface-foreground sm:px-8 lg:min-h-dvh lg:px-12 lg:py-12"
        style={RED_PANEL_LEADER_VARS}
      >
        <ul
          className="hidden max-w-[26rem] space-y-2.5 text-[0.9375rem] lg:block"
          aria-hidden="true"
        >
          {DIRECTORY_EXCERPT.map((entry) => (
            <li key={entry.family} className="flex items-baseline gap-2">
              <span>
                <b>{entry.family}</b> {entry.given}
              </span>
              <span className="leader" />
              <span className="tabular">{entry.tel}</span>
            </li>
          ))}
        </ul>

        {/* Mobile language select, restyled against the red panel */}
        <div className="flex justify-end lg:hidden" style={RED_PANEL_LANGUAGE_VARS}>
          <LoginLanguage id="lang-mobile" />
        </div>

        <div className="flex flex-col-reverse lg:flex-col">
          <p className="mt-3 max-w-[22rem] text-lg font-bold leading-snug lg:mt-0 lg:text-xl">
            {t("tagline")}
          </p>
          <p className="font-display text-[6.5rem] font-bold leading-[0.78] tracking-[-0.01em] lg:mt-6 lg:text-[clamp(8rem,13vw,13rem)]">
            Natel
          </p>
        </div>
      </aside>

      <main className="flex flex-col px-5 sm:px-8 lg:min-h-dvh lg:px-12">
        <div className="hidden justify-end py-8 lg:flex">
          <LoginLanguage id="lang-desktop" />
        </div>
        <div className="h-8 lg:hidden" />
        <div className="flex flex-1 items-start justify-center lg:items-center lg:pb-24">
          <div className="w-full max-w-[24rem]">
            <h1 className="font-display text-[2.75rem] font-bold leading-[0.95] tracking-[-0.005em] text-balance">
              {t("title")}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t("lede")}</p>

            <LoginForm />
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
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-bold">
        {t("lang_label")}
      </label>
      <LanguageSelect id={id} className="h-9 px-2.5 text-sm" />
    </div>
  );
}
