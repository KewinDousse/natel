/**
 * The header's sync warning (DESIGN.md "Header"): nothing while reloads work.
 * After a failure, a button that opens a panel saying what happened and
 * offering what helps: reload the book, or sign in again once the server has
 * refused the session. On phones, where only the icon shows, the panel is
 * what a tap gets.
 */

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useSignOut } from "@/hooks/use-sign-out";
import { useI18n } from "@/i18n/react";
import { buttonClass } from "./ui/button";
import { AlertIcon, RefreshIcon, SpinnerIcon } from "./ui/icons";

/**
 * "ok" while reloads work; "failed" after one failed; "retrying" while one
 * runs after a failure or waits for the network; "expired" when the server
 * refused the session.
 */
export type SyncState = "ok" | "failed" | "retrying" | "expired";

export function SyncWarning({
  sync,
  syncedAt,
  onRetry,
  focusAfter,
}: {
  sync: SyncState;
  /** When the contacts shown were last loaded (ms). */
  syncedAt: number;
  onRetry: () => void;
  /** Takes the focus when the warning goes away from under it. */
  focusAfter: RefObject<HTMLElement | null>;
}) {
  const { t, locale } = useI18n();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const hadFocus = useRef(false);
  const shown = sync !== "ok";
  const expired = sync === "expired";
  const retrying = sync === "retrying";
  const label = t(expired ? "session_expired_title" : "sync_failed");

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (open) actionRef.current?.focus();
  }, [open]);

  // A reload that works removes the warning: the focus it held moves on
  // rather than falling back to the page.
  useEffect(() => {
    if (shown) return;
    setOpen(false);
    if (hadFocus.current && (document.activeElement ?? document.body) === document.body) {
      focusAfter.current?.focus();
    }
    hadFocus.current = false;
  }, [shown, focusAfter]);

  /** Where the focus is; the panel closes when it leaves for elsewhere on the page. */
  useEffect(() => {
    const root = rootRef.current;
    if (!shown || !root) return;
    function onFocusIn() {
      hadFocus.current = true;
    }
    function onFocusOut(event: FocusEvent) {
      const next = event.relatedTarget as Node | null;
      if (next === null || root?.contains(next)) return;
      hadFocus.current = false;
      setOpen(false);
    }
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    return () => {
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, [shown]);

  /** Close on outside clicks; the trigger's own click toggles instead. */
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node | null)) close();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  /** Escape from inside the panel closes it and gives the trigger the focus back. */
  useEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Not also a cancelled edit or a cleared search.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  // The age stays true while the panel is open.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [open]);

  return (
    <>
      {/* Read when the warning appears; the toasts keep role="status". */}
      <p aria-live="polite" className="sr-only">
        {shown ? label : ""}
      </p>
      {shown && (
        // On phones the panel spans the sticky header, like the book menu.
        <div ref={rootRef} className="sm:relative">
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls="sync-panel"
            aria-label={label}
            title={label}
            onClick={() => setOpen((was) => !was)}
            className={buttonClass(
              { variant: "ghost" },
              "w-10 px-0 text-warning hover:text-warning xl:w-auto xl:px-3",
            )}
          >
            {retrying ? <SpinnerIcon /> : <AlertIcon className="size-4" />}
            <span className="hidden xl:inline" aria-hidden="true">
              {label}
            </span>
          </button>
          {open && (
            <div
              id="sync-panel"
              className="absolute inset-x-4 top-14 z-30 rounded-lg bg-popover p-4 text-left shadow-float sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.375rem)] sm:w-80"
            >
              <p className="text-sm font-bold">{label}</p>
              <p id="sync-panel-body" className="mt-1 text-sm leading-snug text-muted-foreground">
                {expired
                  ? t("session_expired_body")
                  : `${t("sync_failed_body")} ${lastSynced(syncedAt, now, locale, t)}`}
              </p>
              <div className="mt-3 flex justify-end">
                {expired ? (
                  <button
                    ref={actionRef}
                    type="button"
                    aria-describedby="sync-panel-body"
                    onClick={() => void signOut()}
                    className={buttonClass({ size: "sm" })}
                  >
                    {t("sign_in_again")}
                  </button>
                ) : (
                  // aria-disabled keeps the focus on it while it reloads.
                  <button
                    ref={actionRef}
                    type="button"
                    aria-describedby="sync-panel-body"
                    aria-disabled={retrying || undefined}
                    onClick={() => {
                      if (!retrying) onRetry();
                    }}
                    className={buttonClass({ size: "sm" }, "pl-2.5 aria-disabled:opacity-60")}
                  >
                    {retrying ? <SpinnerIcon /> : <RefreshIcon />}
                    {t(retrying ? "syncing" : "retry")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** "Dernière synchronisation réussie il y a 2 heures.", in the unit that reads best. */
function lastSynced(
  at: number,
  now: number,
  locale: string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return t("sync_last_now");
  const ago = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const when =
    minutes < 60
      ? ago.format(-minutes, "minute")
      : minutes < 24 * 60
        ? ago.format(-Math.floor(minutes / 60), "hour")
        : ago.format(-Math.floor(minutes / (24 * 60)), "day");
  return t("sync_last", { when });
}
