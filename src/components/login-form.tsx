/**
 * LoginForm — sign-in form with inline validation and error display.
 *
 * Composes the username/password fields, the submit button, the error alert
 * box, and the password-visibility toggle. The CardDAV server is operator
 * configuration, never asked here (ADR 014). Uses useLogin (src/queries/) for
 * the credential check.
 */

import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { useI18n } from "@/i18n/react";
import { IS_DEMO } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { DavError, useLogin } from "@/queries";
import { useSessionStore } from "@/store/session";
import { buttonClass, FIELD_BUTTON_HIT_AREA, FOCUS_RING, fieldClass } from "./ui/button";
import { AlertIcon, EyeIcon, LockIcon, SpinnerIcon } from "./ui/icons";

type FieldName = "username" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

type FormError = { title: string; body?: string };

/** `next` is the page to open once signed in. */
export function LoginForm({ next }: { next: string }) {
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

    try {
      const { auth } = await loginMutation.mutateAsync({ username: username.trim(), password });
      login(auth);
      await navigate({ href: next });
    } catch (err) {
      setFormError(mapLoginError(err));
    }
  }

  const submitting = loginMutation.isPending;

  return (
    <>
      {/* Over plain HTTP, anyone on the network reads the password at
          sign-in, and the session cookie after. localhost counts as secure. */}
      {globalThis.isSecureContext === false && (
        <p className="mt-6 flex gap-2.5 text-sm leading-snug text-warning">
          <LockIcon open className="mt-0.5 size-4" />
          <span>{t("insecure")}</span>
        </p>
      )}

      {IS_DEMO && (
        <p className="mt-6 rounded-lg bg-secondary px-3.5 py-2.5 text-sm leading-snug text-foreground">
          {t("demo_login")}
        </p>
      )}

      {formError && (
        <div
          className="mt-6 flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3.5 text-sm text-destructive"
          role="alert"
        >
          <AlertIcon className="mt-px size-5" />
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
            className={fieldClass("h-12 lg:h-11")}
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
              className={fieldClass("h-12 pr-28 lg:h-11")}
            />
            <button
              type="button"
              aria-controls="pass"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((show) => !show)}
              className={buttonClass(
                { variant: "ghost" },
                `absolute inset-y-0 right-1.5 my-auto h-8 gap-1.5 px-2.5 text-sm ${FIELD_BUTTON_HIT_AREA} focus-visible:ring-offset-0`,
              )}
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
          className={buttonClass({ size: "lg" }, "w-full disabled:opacity-100")}
        >
          {submitting ? (
            <>
              <SpinnerIcon />
              {t("signing_in")}
            </>
          ) : (
            t("submit")
          )}
        </button>
      </form>

      <p className="mt-8 flex gap-2.5 border-t pt-5 text-sm leading-snug text-muted-foreground">
        <LockIcon className="mt-0.5 size-4" />
        <span>{t(IS_DEMO ? "privacy_demo" : "privacy")}</span>
      </p>
      <p className="mt-6 text-caption text-muted-foreground">
        {t("footer")}{" "}
        <a
          href="https://github.com/KewinDousse/natel"
          className={cn(
            "rounded-sm font-bold text-foreground underline decoration-leader underline-offset-2 hover:decoration-foreground",
            FOCUS_RING,
          )}
        >
          {t("source")}
        </a>
      </p>
    </>
  );
}
