/**
 * ImportDialog — what a .vcf import will do, then its progress and counts
 * (ADR 020, ADR 042). Built like the discard dialog. It can't be dismissed
 * while cards are being sent: stopping halfway gains nothing, since a rerun
 * is safe.
 */

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { ImportState } from "@/hooks/use-book-transfer";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import type { ImportFailure, ImportFailureReason } from "@/queries";
import { buttonClass } from "./ui/button";
import { Dialog, DialogActions, DialogTitle } from "./ui/dialog";

const REASON_KEYS: Record<ImportFailureReason, TranslationKey> = {
  unreadable: "import_reason_unreadable",
  duplicate: "import_reason_duplicate",
  conflict: "import_reason_conflict",
  refused: "import_reason_refused",
  network: "import_reason_network",
  timeout: "import_reason_timeout",
  too_large: "import_reason_too_large",
  maybe_too_large: "import_reason_maybe_too_large",
};

export function ImportDialog({
  bookName,
  state,
  onConfirm,
  onCancel,
  onClose,
}: {
  bookName: string;
  state: ImportState;
  /** Starts the previewed import, without the similar cards when `skipSimilar`. */
  onConfirm: (skipSimilar: boolean) => void;
  /** Leaves the preview without importing anything. */
  onCancel: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [skipSimilar, setSkipSimilar] = useState(false);
  const previewing = state.phase === "preview";
  const finished = state.phase === "done" || state.phase === "error";
  const dismiss = previewing ? onCancel : onClose;
  const toImport = previewing
    ? state.plan.create.length - (skipSimilar ? state.similar.length : 0)
    : 0;
  const confirmLabel =
    toImport === 0
      ? t("close")
      : toImport === 1
        ? t("import_start_1")
        : t("import_start", { n: String(toImport) });

  useEffect(() => {
    const previous = document.activeElement;
    panelRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  // While cards are sent the panel holds the focus, so keys stay in the dialog.
  useEffect(() => {
    if (finished || previewing) closeRef.current?.focus();
    else panelRef.current?.focus();
  }, [finished, previewing]);

  function onKeyDown(event: KeyboardEvent) {
    // The page's own shortcuts (E, /, Esc) must not act behind the dialog.
    event.stopPropagation();
    if (event.key === "Escape" && (finished || previewing)) {
      event.preventDefault();
      dismiss();
    }
  }

  return (
    <Dialog
      titleId={titleId}
      panelRef={panelRef}
      busy={state.phase === "running"}
      onDismiss={dismiss}
      onKeyDown={onKeyDown}
    >
      <DialogTitle id={titleId}>{t("import_title", { name: bookName })}</DialogTitle>
      <div aria-live="polite" className="mt-4 text-sm leading-snug">
        {state.phase === "running" && (
          <p className="tabular text-muted-foreground">
            {state.total === 0
              ? t("import_reading")
              : t("import_progress", { done: String(state.done), total: String(state.total) })}
          </p>
        )}
        {state.phase === "preview" && (
          <ul className="tabular space-y-1">
            <li>{t("import_preview_new", { n: String(state.plan.create.length) })}</li>
            <li>{t("import_existing", { n: String(state.plan.existing) })}</li>
            {state.plan.failed.length > 0 && (
              <li className="text-destructive">
                {t("import_preview_failed", { n: String(state.plan.failed.length) })}
              </li>
            )}
          </ul>
        )}
        {state.phase === "error" && <p className="text-destructive">{state.message}</p>}
        {state.phase === "done" && (
          <ul className="tabular space-y-1">
            <li>{t("import_imported", { n: String(state.result.imported) })}</li>
            <li>{t("import_existing", { n: String(state.result.existing) })}</li>
            {state.skipped > 0 && (
              <li>{t("import_skipped_similar", { n: String(state.skipped) })}</li>
            )}
            <li className={state.result.failed.length > 0 ? "text-destructive" : undefined}>
              {t("import_failed", { n: String(state.result.failed.length) })}
            </li>
          </ul>
        )}
      </div>
      {state.phase === "preview" && state.similar.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold">{t("import_similar_title")}</h3>
          <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-sm leading-snug">
            {state.similar.map(({ card, match }) => (
              <li key={card.position}>
                <span className="font-bold">
                  {card.name || t("import_card_n", { n: String(card.position) })}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {t("import_similar_to", { name: match })}
                </span>
              </li>
            ))}
          </ul>
          <label className="mt-2 flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-bold hover:bg-muted">
            <input
              type="checkbox"
              checked={skipSimilar}
              onChange={(event) => setSkipSimilar(event.target.checked)}
              className="size-4 shrink-0 accent-primary"
            />
            <span>
              {state.similar.length === 1
                ? t("import_skip_similar_1")
                : t("import_skip_similar", { n: String(state.similar.length) })}
            </span>
          </label>
        </div>
      )}
      {state.phase === "preview" && state.plan.failed.length > 0 && (
        <FailureList title={t("import_preview_failed_list")} failures={state.plan.failed} />
      )}
      {state.phase === "done" && state.result.failed.length > 0 && (
        <FailureList title={t("import_failed_list")} failures={state.result.failed} />
      )}
      {previewing && (
        <DialogActions>
          {toImport > 0 && (
            <button
              type="button"
              onClick={onCancel}
              className={buttonClass({ variant: "outline" })}
            >
              {t("cancel")}
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={toImport > 0 ? () => onConfirm(skipSimilar) : onCancel}
            className={buttonClass()}
          >
            {confirmLabel}
          </button>
        </DialogActions>
      )}
      {finished && (
        <DialogActions>
          <button ref={closeRef} type="button" onClick={onClose} className={buttonClass()}>
            {t("close")}
          </button>
        </DialogActions>
      )}
    </Dialog>
  );
}

function FailureList({ title, failures }: { title: string; failures: ImportFailure[] }) {
  const { t } = useI18n();
  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold">{title}</h3>
      <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-sm leading-snug">
        {failures.map((failure) => (
          <li key={failure.position}>
            <span className="font-bold">
              {failure.name || t("import_card_n", { n: String(failure.position) })}
            </span>
            <span className="text-muted-foreground"> · {t(REASON_KEYS[failure.reason])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
