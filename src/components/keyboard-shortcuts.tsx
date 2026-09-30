/**
 * KeyboardShortcuts — the app-wide single keys: `N` opens a new contact, `?`
 * the dialog listing every shortcut (DESIGN.md, Keyboard shortcuts). The
 * dialog is built like the import dialog once finished: one "Fermer" button,
 * which takes the focus.
 */

import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import { isApple, isDesktop, isDialogOpen, isInMenu, isPlainKey, isTyping } from "@/lib/shortcuts";

export function KeyboardShortcuts({ canCreate }: { canCreate: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.repeat || !isPlainKey(event) || isTyping(event.target) || isDialogOpen()) return;
      if (isInMenu(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        setOpen(true);
      } else if ((event.key === "n" || event.key === "N") && canCreate) {
        event.preventDefault();
        void navigate({ to: "/contacts/new" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, canCreate]);

  return open ? <ShortcutsDialog onClose={() => setOpen(false)} /> : null;
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const desktop = isDesktop();
  const mod = isApple() ? "⌘" : "Ctrl";

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent) {
    // The page's own shortcuts must not act behind the dialog.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    // Close is the only control: keep Tab on it.
    if (event.key === "Tab") {
      event.preventDefault();
      closeRef.current?.focus();
    }
  }

  const rows: { keys: ReactNode; label: string }[] = [];
  if (desktop) {
    rows.push(
      { keys: <Key>/</Key>, label: t("shortcut_search") },
      {
        keys: (
          <>
            <Key label={t("key_up")}>↑</Key>
            <Key label={t("key_down")}>↓</Key>
          </>
        ),
        label: t("shortcut_prev_next"),
      },
    );
  }
  rows.push(
    { keys: <Key>N</Key>, label: t("shortcut_new") },
    { keys: <Key>E</Key>, label: t("shortcut_edit") },
    {
      keys: (
        <>
          <Key label={isApple() ? t("key_cmd") : undefined}>{mod}</Key>
          <Key>{t("key_enter")}</Key>
        </>
      ),
      label: t("shortcut_save"),
    },
    { keys: <Key label={t("key_esc")}>Esc</Key>, label: t("shortcut_escape") },
    { keys: <Key>?</Key>, label: t("shortcut_help") },
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center dark:bg-black/60"
    >
      <div
        tabIndex={-1}
        role="document"
        className="w-full max-w-md rounded-t-xl bg-background p-6 shadow-overlay focus:outline-none sm:rounded-xl"
      >
        <h2 id={titleId} className="font-display text-2xl font-bold leading-tight">
          {t("shortcuts_title")}
        </h2>
        <dl className="mt-4 space-y-2 text-sm leading-snug">
          {rows.map(({ keys, label }) => (
            <div key={label} className="grid grid-cols-[8.5rem_1fr] items-center gap-x-4">
              <dt className="flex items-center gap-1 whitespace-nowrap">{keys}</dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A key cap; `label` names a symbol screen readers may not read aloud. */
function Key({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm border bg-muted px-1.5 font-sans text-caption text-muted-foreground">
      {label ? (
        <>
          <span aria-hidden="true">{children}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        children
      )}
    </kbd>
  );
}
