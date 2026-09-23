import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { DavError, discoverAddressBooks } from "@/dav";
import type { DavAuth } from "@/dav/types";
import { useI18n } from "@/i18n/react";
import { useServerUrl, useSessionStore } from "@/store/session";

/**
 * Sign-in screen — first screen of Phase 2.
 *
 * Layout and classes come from the design handoff "Sign-in screen" section
 * (natel-design/natel-annuaire-login.html). The red panel is the only place
 * `brand` is allowed to mark position, never action.
 */
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (useSessionStore.getState().auth) throw redirect({ to: "/" });
  },
  component: LoginRoute,
});

type FieldName = "server" | "username" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

type FormError = { title: string; body?: string };

/** Decorative directory excerpt on the red panel (not clickable). */
const DIRECTORY_EXCERPT: Array<{ family: string; given: string; tel: string }> = [
  { family: "Favre", given: "Aurélien", tel: "079 412 58 03" },
  { family: "Haddad", given: "Amina", tel: "079 204 18 33" },
  { family: "Pasche", given: "Camille", tel: "076 205 91 14" },
  { family: "Rochat", given: "Chloé", tel: "079 877 40 12" },
];

/** Restyle the language switch against the red panel (CSS variable overrides). */
const RED_PANEL_SWITCH_VARS = {
  "--muted": "color-mix(in oklab, var(--brand-foreground) 18%, transparent)",
  "--muted-foreground": "var(--brand-foreground)",
  "--foreground": "var(--brand-foreground)",
  "--primary": "var(--brand-foreground)",
  "--primary-foreground": "var(--brand)",
  "--ring": "var(--brand-foreground)",
  "--background": "var(--brand)",
} as CSSProperties;

/** Dotted-leader colour on the red panel. */
const RED_PANEL_LEADER_VARS = {
  "--leader": "color-mix(in oklab, var(--brand-foreground) 45%, transparent)",
} as CSSProperties;

function LoginRoute() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const login = useSessionStore((s) => s.login);
  const persistedServerUrl = useServerUrl();

  const [serverUrl, setServerUrl] = useState(persistedServerUrl);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberServer, setRememberServer] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = t("doc_title");
  }, [t]);

  function setFieldError(field: FieldName, message: string | undefined) {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }

  function validateServer(value: string): string | undefined {
    const v = value.trim();
    if (v.length === 0) return t("field_server_empty");
    try {
      const url = new URL(v);
      if (url.protocol !== "http:" && url.protocol !== "https:") return t("field_server_invalid");
    } catch {
      return t("field_server_invalid");
    }
    return undefined;
  }

  function validateRequired(value: string, emptyMessage: string): string | undefined {
    return value.trim().length === 0 ? emptyMessage : undefined;
  }

  function validateAll(server: string): FieldErrors {
    return {
      server: validateServer(server),
      username: validateRequired(username, t("field_user_empty")),
      password: validateRequired(password, t("field_pass_empty")),
    };
  }

  /** Map a failed credential check to the error box: auth vs connection. */
  function mapLoginError(err: unknown): FormError {
    if (err instanceof DavError && err.code === "AUTH") {
      return { title: t("err_auth") };
    }
    return {
      title: t("err_connection_title", { host: hostOf(serverUrl) }),
      body: t("err_connection_body"),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const server = serverUrl.trim();
    const nextErrors = validateAll(server);
    setErrors(nextErrors);
    setFormError(null);
    if (nextErrors.server || nextErrors.username || nextErrors.password) return;

    const auth: DavAuth = { serverUrl: server, username: username.trim(), password };
    setSubmitting(true);
    try {
      // The credential check: discovering address books requires valid auth.
      await discoverAddressBooks(auth);
      login(auth, { rememberServer });
      await navigate({ to: "/" });
    } catch (err) {
      setFormError(mapLoginError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh pb-14 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pb-0">
      <aside
        className="relative flex flex-col justify-between gap-6 overflow-hidden bg-brand px-5 pb-7 lg:gap-10 pt-[max(1.25rem,env(safe-area-inset-top))] text-brand-foreground sm:px-8 lg:min-h-dvh lg:px-12 lg:py-12"
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

        {/* Mobile language switch, restyled against the red panel */}
        <div className="flex justify-end lg:hidden" style={RED_PANEL_SWITCH_VARS}>
          <LanguageSwitch />
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
          <LanguageSwitch />
        </div>
        <div className="h-8 lg:hidden" />
        <div className="flex flex-1 items-start justify-center lg:items-center lg:pb-24">
          <div className="w-full max-w-[24rem]">
            <h1 className="font-display text-[2.75rem] font-bold leading-[0.95] tracking-[-0.005em] text-balance">
              {t("title")}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t("lede")}</p>

            {formError && (
              <div
                className="mt-6 flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3.5 text-sm text-destructive"
                role="alert"
              >
                <AlertIcon />
                <p className="leading-snug">
                  <span className="font-bold">{formError.title}</span>{" "}
                  {formError.body && <span className="text-foreground">{formError.body}</span>}
                </p>
              </div>
            )}

            <form className="mt-7 space-y-5" onSubmit={handleSubmit} noValidate>
              <div className="space-y-1.5">
                <label htmlFor="server" className="block text-sm font-bold">
                  {t("server")}
                </label>
                <input
                  id="server"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  onBlur={() => setFieldError("server", validateServer(serverUrl))}
                  aria-invalid={errors.server ? true : undefined}
                  aria-describedby={errors.server ? "server-error" : "server-hint"}
                  className="block h-12 w-full rounded-md border border-input bg-card px-3.5 text-base text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[invalid=true]:border-destructive lg:h-11 lg:text-[0.9375rem]"
                />
                {errors.server ? (
                  <p id="server-error" className="text-caption leading-snug text-destructive">
                    {errors.server}
                  </p>
                ) : (
                  <p id="server-hint" className="text-caption leading-snug text-muted-foreground">
                    {t("server_hint")}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="user" className="block text-sm font-bold">
                  {t("user")}
                </label>
                <input
                  id="user"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onBlur={() =>
                    setFieldError("username", validateRequired(username, t("field_user_empty")))
                  }
                  aria-invalid={errors.username ? true : undefined}
                  aria-describedby={errors.username ? "user-error" : undefined}
                  className="block h-12 w-full rounded-md border border-input bg-card px-3.5 text-base text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[invalid=true]:border-destructive lg:h-11 lg:text-[0.9375rem]"
                />
                {errors.username && (
                  <p id="user-error" className="text-caption leading-snug text-destructive">
                    {errors.username}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pass" className="block text-sm font-bold">
                  {t("pass")}
                </label>
                <div className="relative">
                  <input
                    id="pass"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() =>
                      setFieldError("password", validateRequired(password, t("field_pass_empty")))
                    }
                    aria-invalid={errors.password ? true : undefined}
                    aria-describedby={errors.password ? "pass-error" : undefined}
                    className="block h-12 w-full rounded-md border border-input bg-card pl-3.5 pr-28 text-base text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-[invalid=true]:border-destructive lg:h-11 lg:text-[0.9375rem]"
                  />
                  <button
                    type="button"
                    aria-controls="pass"
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((show) => !show)}
                    className="absolute inset-y-1.5 right-1.5 inline-flex items-center gap-1.5 rounded-full px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <EyeIcon />
                    <span>{showPassword ? t("hide") : t("show")}</span>
                  </button>
                </div>
                {errors.password && (
                  <p id="pass-error" className="text-caption leading-snug text-destructive">
                    {errors.password}
                  </p>
                )}
              </div>

              <label
                htmlFor="remember-server"
                className="flex items-start gap-3 py-1 text-sm leading-snug"
              >
                <Checkbox
                  id="remember-server"
                  checked={rememberServer}
                  onChange={(e) => setRememberServer(e.target.checked)}
                />
                <span>{t("remember")}</span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-bold text-primary-foreground transition-colors hover:bg-primary/85 active:bg-primary/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:h-11"
              >
                {t("submit")}
              </button>
            </form>

            <p className="mt-8 flex gap-2.5 border-t pt-5 text-sm leading-snug text-muted-foreground">
              <LockIcon />
              <span>{t("privacy")}</span>
            </p>
            <p className="mt-6 text-caption text-muted-foreground">
              {t("footer")}{" "}
              <a
                href="https://github.com/KewinDousse/natel"
                className="rounded-sm font-bold text-foreground underline decoration-leader underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("source")}
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

/** Extract the host from a server URL for the connection error message. */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <fieldset
      // fieldset carries the implicit group role — the semantic element for a
      // labelled set of toggle buttons
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

function AlertIcon(): ReactNode {
  return (
    <svg
      className="size-5 mt-px shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function EyeIcon(): ReactNode {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function LockIcon(): ReactNode {
  return (
    <svg
      className="size-4 mt-0.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
