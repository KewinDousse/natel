/**
 * Dialog — the modal shell every dialog shares (DESIGN.md "Discard dialog"):
 * dimmed backdrop, bottom sheet on phones and centred panel from `sm`, a
 * `font-display` title, and Tab kept inside the panel. Each dialog keeps its
 * own initial focus, Esc handling and actions.
 */

import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What Tab stops on inside `root`, in order: a radio group counts once, at
 * its checked radio or, with none checked, its first.
 */
function tabbables(root: HTMLElement): HTMLElement[] {
  const found = Array.from(root.querySelectorAll<HTMLElement>(TABBABLE));
  return found.filter((el) => {
    if (el.closest("[hidden], [inert]")) return false;
    if (!(el instanceof HTMLInputElement) || el.type !== "radio" || el.name === "") return true;
    const group = found.filter(
      (other): other is HTMLInputElement =>
        other instanceof HTMLInputElement && other.type === "radio" && other.name === el.name,
    );
    const checked = group.find((radio) => radio.checked);
    return el === (checked ?? group[0]);
  });
}

/** Keeps Tab and Shift+Tab cycling through the panel's controls. */
export function trapTab(event: KeyboardEvent, panel: HTMLElement | null) {
  if (event.key !== "Tab" || panel === null) return;
  const stops = tabbables(panel);
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  const inside = active instanceof HTMLElement && stops.includes(active);
  if (!inside) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function Dialog({
  titleId,
  describedBy,
  panelRef,
  onDismiss,
  onKeyDown,
  busy = false,
  className,
  children,
}: {
  titleId: string;
  /** The id of the text that says what the dialog is about, when there is one. */
  describedBy?: string;
  panelRef: RefObject<HTMLDivElement | null>;
  /** A click on the backdrop; without it, the backdrop does nothing. */
  onDismiss?: () => void;
  /** Runs before Tab is trapped; may call preventDefault to keep the focus. */
  onKeyDown?: (event: KeyboardEvent) => void;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      aria-busy={busy || undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented) trapTab(event, panelRef.current);
      }}
      onClick={(event) => {
        if (onDismiss && !busy && event.target === event.currentTarget) onDismiss();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 duration-200 animate-in fade-in-0 sm:items-center dark:bg-black/60"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="document"
        className={cn(
          "max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-xl bg-background p-6 shadow-overlay duration-200 animate-in slide-in-from-bottom-2 focus:outline-none sm:rounded-xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="font-display text-2xl font-bold leading-tight text-balance">
      {children}
    </h2>
  );
}

/** The actions row: stacked on phones, right-aligned from `sm`. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">{children}</div>;
}
