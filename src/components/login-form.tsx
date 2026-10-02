/**
 * LoginForm — sign-in form with inline validation and error display.
 *
 * Composes the username/password fields, the submit button, the error alert
 * box, and the password-visibility toggle. The CardDAV server is operator
 * configuration, never asked here (ADR 014). Uses useLogin (src/queries/) for
 * the credential check.
 */

import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useI18n } from "@/i18n/react";
import { IS_DEMO } from "@/lib/demo";
import { type DavAuth, DavError, useLogin } from "@/queries";
import { useSessionStore } from "@/store/session";

type FieldName = "username" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

type FormError = { title: string; body?: string };

export function LoginForm() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const login = useSessionStore((s) => s.login);
  const loginMutation = useLogin();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormError | null>(null);

  useEffect(() => {
    document.title = t("doc_title");
  }, [t]);

  function setFieldError(field: FieldName, message: string | undefined) {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }

  function validateRequired(value: string, emptyMessage: string): string | undefined {
    return value.trim().length === 0 ? emptyMessage : undefined;
  }

  function validateAll(): FieldErrors {
    return {
      username: validateRequired(username, t("field_user_empty")),
      password: validateRequired(password, t("field_pass_empty")),
    };
  }

  /** Map a failed credential check to the error box: auth vs connection. */
  function mapLoginError(err: unknown): FormError {
    if (err instanceof DavError && err.code === "AUTH") {
      return { title: t("err_auth") };
    }
    return { title: t("err_connection_title"), body: t("err_connection_body") };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginMutation.isPending) return;
    const nextErrors = validateAll();
    setErrors(nextErrors);
    setFormError(null);
    if (nextErrors.username || nextErrors.password) return;

    const auth: DavAuth = { username: username.trim(), password };
    try {
      await loginMutation.mutateAsync(auth);
      login(auth);
      await navigate({ to: "/contacts" });
    } catch (err) {
      setFormError(mapLoginError(err));
    }
  }

  const submitting = loginMutation.isPending;

  return (
    <>
      {/* Basic auth sends the password with every request: over plain HTTP,
          anyone on the network reads it. localhost counts as secure. */}
      {globalThis.isSecureContext === false && (
        <p className="mt-6 flex gap-2.5 text-sm leading-snug text-warning">
          <LockIcon open />
          <span>{t("insecure")}</span>
        </p>
      )}

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

      {/*
        method and names let password managers recognise a sign-in form; the
        submit handler prevents the browser's own post (post rather than get,
        so a form sent before the handler runs never puts the password in a URL).
      */}
      <form method="post" className="mt-7 space-y-5" onSubmit={handleSubmit} noValidate>
        <div className="space-y-1.5">
          <label htmlFor="user" className="block text-sm font-bold">
            {t("user")}
          </label>
          <input
            id="user"
            name="username"
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
              name="password"
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

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-bold text-primary-foreground transition-colors hover:bg-primary/85 active:bg-primary/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:h-11"
        >
          {t("submit")}
        </button>
      </form>

      {IS_DEMO && (
        <p className="mt-5 rounded-lg bg-secondary px-3.5 py-2.5 text-sm leading-snug text-foreground">
          {t("demo_login")}
        </p>
      )}

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
    </>
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

function LockIcon({ open = false }: { open?: boolean }): ReactNode {
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
      <path d={open ? "M8 11V7a4 4 0 0 1 7.75-1.4" : "M8 11V7a4 4 0 0 1 8 0v4"} />
    </svg>
  );
}
