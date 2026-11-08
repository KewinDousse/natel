/**
 * SettingsPage — the account, display preferences (ADR 019), shortcuts and
 * app information, in the detail pane on desktop and as its own screen on
 * phones. One labelled select per preference; a change applies at once, with
 * no save button. Back, or Esc on desktop, returns to the list.
 */

import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { useSignOut } from "@/hooks/use-sign-out";
import { useI18n } from "@/i18n/react";
import { APP_REVISION, APP_VERSION } from "@/lib/app-info";
import type { SortBy } from "@/lib/contact-list";
import { IS_DEMO } from "@/lib/demo";
import { MAP_APPS, type MapApp } from "@/lib/map-link";
import type { Theme } from "@/lib/theme";
import { type AvatarShape, type LabelPosition, usePreferences } from "@/store/preferences";
import { useAuth, useBookParam } from "@/store/session";
import { ReadingRow, ReadingSection } from "./contact-reading-fields";
import { InstallApp } from "./install-app";
import { openShortcuts } from "./keyboard-shortcuts";
import { LanguageSelect } from "./language-select";
import { MobileTopBar } from "./mobile-top-bar";
import { buttonClass, FOCUS_RING, fieldClass } from "./ui/button";
import { LogoutIcon } from "./ui/icons";
import { NativeSelect } from "./ui/native-select";
import { UpdateStatus } from "./update-notice";

const SYSTEM = "system";
const AUTO = "auto";
const BUG_REPORT_URL = "https://github.com/KewinDousse/natel/issues/new/choose";

export function SettingsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const book = useBookParam();
  const signOut = useSignOut();
  const auth = useAuth();
  const {
    sortBy,
    setSortBy,
    theme,
    setTheme,
    mapApp,
    setMapApp,
    labelPosition,
    setLabelPosition,
    avatarShape,
    setAvatarShape,
  } = usePreferences();

  useEffect(() => {
    document.title = t("settings_doc_title");
  }, [t]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const desktop = window.matchMedia?.("(min-width: 64rem)").matches ?? false;
      if (event.key === "Escape" && desktop && !event.defaultPrevented) {
        void navigate(book ? { to: "/contacts/$book", params: { book } } : { to: "/contacts" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, book]);

  return (
    <>
      <MobileTopBar label={t("settings")} />
      <div className="mx-auto w-full max-w-[44rem] px-5 pb-10 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14">
        <h1 className="font-display text-title-sm font-bold leading-none sm:text-title lg:text-person">
          {t("settings")}
        </h1>

        <SettingsSection title={t("settings_account")}>
          {auth && (
            <p className="text-base lg:text-body">
              {t("signed_in_as")} <b className="font-bold">{auth.username}</b>
            </p>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className={buttonClass({ variant: "outline" }, "pl-3")}
          >
            <LogoutIcon className="size-4" />
            {t("logout")}
          </button>
        </SettingsSection>

        <SettingsSection title={t("settings_display")}>
          <Field id="setting-language" label={t("lang_label")}>
            <LanguageSelect id="setting-language" className={fieldClass("h-12 lg:h-11")} />
          </Field>
          <Field id="setting-theme" label={t("theme_label")}>
            <NativeSelect
              id="setting-theme"
              value={theme ?? SYSTEM}
              onChange={(event) => {
                const value = event.target.value;
                setTheme(value === SYSTEM ? null : (value as Theme));
              }}
              className={fieldClass("h-12 lg:h-11")}
            >
              <option value={SYSTEM}>{t("theme_system")}</option>
              <option value="light">{t("theme_light")}</option>
              <option value="dark">{t("theme_dark")}</option>
            </NativeSelect>
          </Field>
        </SettingsSection>
        <SettingsSection title={t("settings_contacts")}>
          <Field id="setting-avatar-shape" label={t("avatar_shape")}>
            <NativeSelect
              id="setting-avatar-shape"
              value={avatarShape}
              onChange={(event) => setAvatarShape(event.target.value as AvatarShape)}
              className={fieldClass("h-12 lg:h-11")}
            >
              <option value="round">{t("avatar_shape_round")}</option>
              <option value="square">{t("avatar_shape_square")}</option>
            </NativeSelect>
          </Field>
          <Field id="setting-label-position" label={t("label_position")}>
            <NativeSelect
              id="setting-label-position"
              aria-describedby="label-position-hint"
              value={labelPosition}
              onChange={(event) => setLabelPosition(event.target.value as LabelPosition)}
              className={fieldClass("h-12 lg:h-11")}
            >
              <option value="auto">{t("label_position_auto")}</option>
              <option value="left">{t("label_position_left")}</option>
              <option value="above">{t("label_position_above")}</option>
            </NativeSelect>
            <p id="label-position-hint" className="text-sm text-muted-foreground">
              {t("label_position_hint")}
            </p>
          </Field>
          <figure
            aria-label={t("label_position_preview")}
            className="rounded-lg border bg-background p-4"
          >
            <figcaption className="mb-3 text-sm text-muted-foreground">
              {t("label_position_preview")}
            </figcaption>
            <ReadingSection title={t("s_phones_1")} heading="h3">
              <ReadingRow label={t("t_cell")}>
                <span className="tabular font-bold">079 000 00 01</span>
              </ReadingRow>
            </ReadingSection>
          </figure>
          <Field id="setting-sort" label={t("sort_label")}>
            <NativeSelect
              id="setting-sort"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortBy)}
              className={fieldClass("h-12 lg:h-11")}
            >
              <option value="given">{t("sort_given")}</option>
              <option value="family">{t("sort_family")}</option>
            </NativeSelect>
          </Field>
          <Field id="setting-map" label={t("map_label")}>
            <NativeSelect
              id="setting-map"
              value={mapApp ?? AUTO}
              onChange={(event) => {
                const value = event.target.value;
                setMapApp(value === AUTO ? null : (value as MapApp));
              }}
              className={fieldClass("h-12 lg:h-11")}
            >
              <option value={AUTO}>{t("map_auto")}</option>
              {MAP_APPS.map((app) => (
                <option key={app} value={app}>
                  {t(`map_${app}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </SettingsSection>

        {/* Keys are for a keyboard: from lg, like the rest of the hints. */}
        <SettingsSection title={t("shortcuts_title")} className="hidden lg:block">
          <button
            type="button"
            onClick={openShortcuts}
            className={buttonClass({ variant: "outline" })}
          >
            {t("shortcuts_show")}
          </button>
        </SettingsSection>

        <SettingsSection title={t("settings_about")}>
          <p className="text-sm text-muted-foreground">
            {t("app_version", { version: APP_VERSION })}
            {APP_REVISION && (
              <>
                {" "}
                <span className="break-all">({APP_REVISION})</span>
              </>
            )}
          </p>
          {!IS_DEMO && <UpdateStatus />}
          <ul className="space-y-3 text-sm">
            <li>
              <Link
                to="/settings/help"
                className={`inline-flex min-h-10 items-center rounded-sm font-bold underline decoration-leader underline-offset-2 hover:decoration-foreground ${FOCUS_RING}`}
              >
                {t("help_guide")}
              </Link>
            </li>
            <li>
              <a
                href={BUG_REPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex min-h-10 items-center rounded-sm font-bold underline decoration-leader underline-offset-2 hover:decoration-foreground ${FOCUS_RING}`}
              >
                {t("help_bug")}
              </a>
            </li>
          </ul>
          <InstallApp />
        </SettingsSection>
      </div>
    </>
  );
}

function SettingsSection({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <h2 className="mt-10 mb-4 border-t pt-4 text-sm font-bold text-muted-foreground">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] sm:items-center sm:gap-x-6 sm:space-y-0 [&>p]:sm:col-start-2">
      <label htmlFor={id} className="block text-sm font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}
