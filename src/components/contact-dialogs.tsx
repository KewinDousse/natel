/**
 * The contact page's own dialogs: confirming a destructive action, and the
 * properties of the card it doesn't show.
 */

import { type ReactNode, useEffect, useId, useRef } from "react";
import { useI18n } from "@/i18n/react";
import { buttonClass } from "./ui/button";
import { Dialog, DialogActions, DialogTitle } from "./ui/dialog";

/**
 * Modal confirming a destructive action (dropping edits, deleting the
 * contact). Focus starts on the safe action; Esc is handled by the page,
 * which owns the window key listener.
 */
export function ConfirmDialog({
  title,
  body,
  continueLabel,
  confirmLabel,
  confirmIcon,
  onContinue,
  onConfirm,
}: {
  title: string;
  /** What confirming does, when the title doesn't say it all. */
  body?: string;
  continueLabel: string;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  onContinue: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    continueRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return (
    <Dialog
      titleId={titleId}
      describedBy={body ? bodyId : undefined}
      panelRef={panelRef}
      onDismiss={onContinue}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      {body && (
        <p id={bodyId} className="mt-3 text-sm leading-snug text-muted-foreground">
          {body}
        </p>
      )}
      <DialogActions>
        <button
          ref={continueRef}
          type="button"
          onClick={onContinue}
          className={buttonClass({ variant: "outline" })}
        >
          {continueLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={buttonClass({ variant: "destructive" }, confirmIcon ? "pl-3.5" : undefined)}
        >
          {confirmIcon}
          {confirmLabel}
        </button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The card's properties the page doesn't show, as vCard lines: technical, for
 * whoever wants to check what a save keeps.
 */
export function UnshownPropertiesDialog({
  lines,
  onClose,
}: {
  lines: string[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return (
    <Dialog titleId={titleId} panelRef={panelRef} onDismiss={onClose} className="sm:max-w-xl">
      <DialogTitle id={titleId}>{t("unshown_title")}</DialogTitle>
      <p className="mt-3 text-sm leading-snug text-muted-foreground">{t("unshown_body")}</p>
      <section aria-label={t("unshown_lines")} className="mt-4">
        <pre
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a long list must scroll from the keyboard too
          tabIndex={0}
          className="max-h-[50dvh] overflow-auto rounded-md bg-muted p-3 font-mono text-caption leading-relaxed whitespace-pre-wrap break-all text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {lines.join("\n")}
        </pre>
      </section>
      <DialogActions>
        <button ref={closeRef} type="button" onClick={onClose} className={buttonClass()}>
          {t("close")}
        </button>
      </DialogActions>
    </Dialog>
  );
}
