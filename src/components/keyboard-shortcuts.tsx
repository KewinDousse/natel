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
import { buttonClass } from "./ui/button";
import { Dialog, DialogActions, DialogTitle } from "./ui/dialog";

const OPEN_EVENT = "natel:open-shortcuts";

/** Opens the "Raccourcis clavier" dialog, as `?` does. */
export function openShortcuts() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

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
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [navigate, canCreate]);

  return open ? <ShortcutsDialog onClose={() => setOpen(false)} /> : null;
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
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
    <Dialog titleId={titleId} panelRef={panelRef} onDismiss={onClose} onKeyDown={onKeyDown}>
      <DialogTitle id={titleId}>{t("shortcuts_title")}</DialogTitle>
      <dl className="mt-4 space-y-2 text-sm leading-snug">
        {rows.map(({ keys, label }) => (
          <div key={label} className="grid grid-cols-[8.5rem_1fr] items-center gap-x-4">
            <dt className="flex items-center gap-1 whitespace-nowrap">{keys}</dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
      <DialogActions>
        <button ref={closeRef} type="button" onClick={onClose} className={buttonClass()}>
          {t("close")}
        </button>
      </DialogActions>
    </Dialog>
  );
}

/** A key cap; `label` names a symbol screen readers may not read aloud. */
export function Key({ children, label }: { children: ReactNode; label?: string }) {
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
