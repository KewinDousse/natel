/**
 * SettingsPage — display preferences (ADR 019), in the detail pane on
 * desktop and as its own screen on phones. One labelled select per
 * preference; a change applies at once, with no save button. Back, or Esc
 * on desktop, returns to the list.
 */

import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useI18n } from "@/i18n/react";
import { MobileTopBar } from "./contact-page";
import { LanguageSelect } from "./language-select";

export function SettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const desktop = window.matchMedia?.("(min-width: 64rem)").matches ?? false;
      if (event.key === "Escape" && desktop && !event.defaultPrevented) {
        void navigate({ to: "/contacts" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <>
      <MobileTopBar label={t("settings")} />
      <div className="mx-auto w-full max-w-[44rem] px-5 pb-10 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14">
        <h1 className="font-display text-[2.25rem] font-bold leading-none sm:text-[2.75rem] lg:text-person">
          {t("settings")}
        </h1>
        <div className="mt-8 max-w-sm space-y-1.5">
          <label htmlFor="setting-language" className="block text-sm font-bold">
            {t("lang_label")}
          </label>
          <LanguageSelect
            id="setting-language"
            className="h-12 w-full px-3.5 text-base lg:h-11 lg:text-[0.9375rem]"
          />
        </div>
      </div>
    </>
  );
}
