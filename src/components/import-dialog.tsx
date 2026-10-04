/**
 * ImportDialog — progress, then counts, of a .vcf import (ADR 020). Built like
 * the discard dialog. It can't be dismissed while cards are being sent:
 * stopping halfway gains nothing, since a rerun is safe.
 */

import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import type { ImportFailureReason, ImportResult } from "@/queries";

export type ImportState =
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; result: ImportResult }
  | { phase: "error"; message: string };

const REASON_KEYS: Record<ImportFailureReason, TranslationKey> = {
  unreadable: "import_reason_unreadable",
  duplicate: "import_reason_duplicate",
  conflict: "import_reason_conflict",
  refused: "import_reason_refused",
  network: "import_reason_network",
  too_large: "import_reason_too_large",
  maybe_too_large: "import_reason_maybe_too_large",
};

export function ImportDialog({
  bookName,
  state,
  onClose,
}: {
  bookName: string;
  state: ImportState;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const finished = state.phase !== "running";

  useEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (finished) closeRef.current?.focus();
  }, [finished]);

  function onKeyDown(event: KeyboardEvent) {
    // The page's own shortcuts (E, /, Esc) must not act behind the dialog.
    event.stopPropagation();
    if (event.key === "Escape" && finished) {
      event.preventDefault();
      onClose();
    }
    // Close is the only control: keep Tab on it.
    if (event.key === "Tab") {
      event.preventDefault();
      closeRef.current?.focus();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (finished && event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center dark:bg-black/60"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="document"
        className="w-full max-w-md rounded-t-xl bg-background p-6 shadow-overlay focus:outline-none sm:rounded-xl"
      >
        <h2 id={titleId} className="font-display text-2xl font-bold leading-tight">
          {t("import_title", { name: bookName })}
        </h2>
        <div aria-live="polite" className="mt-4 text-sm leading-snug">
          {state.phase === "running" && (
            <p className="tabular text-muted-foreground">
              {state.total === 0
                ? t("import_reading")
                : t("import_progress", { done: String(state.done), total: String(state.total) })}
            </p>
          )}
          {state.phase === "error" && <p className="text-destructive">{state.message}</p>}
          {state.phase === "done" && (
            <ul className="tabular space-y-1">
              <li>{t("import_imported", { n: String(state.result.imported) })}</li>
              <li>{t("import_existing", { n: String(state.result.existing) })}</li>
              <li className={state.result.failed.length > 0 ? "text-destructive" : undefined}>
                {t("import_failed", { n: String(state.result.failed.length) })}
              </li>
            </ul>
          )}
        </div>
        {state.phase === "done" && state.result.failed.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-bold">{t("import_failed_list")}</h3>
            <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-sm leading-snug">
              {state.result.failed.map((failure) => (
                <li key={failure.position}>
                  <span className="font-bold">
                    {failure.name || t("import_card_n", { n: String(failure.position) })}
                  </span>
                  <span className="text-muted-foreground"> · {t(REASON_KEYS[failure.reason])}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {finished && (
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
        )}
      </div>
    </div>
  );
}
