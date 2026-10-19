/**
 * The edit form's sticky bottom bar (DESIGN.md "Contact page"): Annuler and
 * Enregistrer, and above them whatever stops a save, so the form itself never
 * moves.
 */

import type { ReactNode } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import { DavError, type GroupFailure } from "@/queries";
import { buttonClass } from "./button";
import { SpinnerIcon } from "./icons";

/** The same column as the form, so the buttons line up with its right edge. */
const COLUMN = "mx-auto w-full max-w-[44rem] px-5 sm:px-8 lg:px-10 xl:px-14";

export function ContactEditBar({
  conflict,
  deleteConflict,
  groupFailures,
  saveError,
  invalidCount,
  saving,
  busy,
  deleting,
  onCancel,
  onSave,
  onReload,
  onOverwrite,
  onGroupOverwrite,
}: {
  /** The card changed elsewhere since the edit began (412 on save). */
  conflict: boolean;
  /** A 412 on delete or move: only reloading makes sense. */
  deleteConflict: "delete" | "move" | null;
  groupFailures: GroupFailure[];
  saveError: string | null;
  /** Fields a save attempt found to correct, 0 when none. */
  invalidCount: number;
  saving: boolean;
  busy: boolean;
  deleting: boolean;
  onCancel: () => void;
  onSave: () => void;
  onReload: () => void;
  onOverwrite: () => void;
  onGroupOverwrite: () => void;
}) {
  const { t } = useI18n();
  const groupConflict = groupFailures.some(
    (f) => f.error instanceof DavError && f.error.code === "CONFLICT",
  );

  return (
    <div className="sticky bottom-0 z-30 mt-auto border-t bg-background py-3 shadow-float">
      <div className={COLUMN}>
        {conflict && (
          <Notice title={t("conflict_title")}>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={onReload} className={buttonClass({ size: "sm" })}>
                {t("conflict_reload")}
              </button>
              <button
                type="button"
                onClick={onOverwrite}
                className={buttonClass({ variant: "outline", size: "sm" })}
              >
                {t("conflict_overwrite")}
              </button>
            </div>
          </Notice>
        )}

        {deleteConflict && (
          <Notice title={t("conflict_title")} alert>
            <p className="mt-1 text-sm text-destructive">
              {t(deleteConflict === "move" ? "conflict_move_hint" : "conflict_delete_hint")}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={onReload} className={buttonClass({ size: "sm" })}>
                {t("conflict_reload")}
              </button>
            </div>
          </Notice>
        )}

        {groupFailures.length > 0 && (
          <Notice title={t("groups_not_saved")} alert>
            <ul className="mt-1 text-sm text-destructive">
              {groupFailures
                .filter(
                  (f, i, all) => all.findIndex((g) => g.name === f.name && g.kind === f.kind) === i,
                )
                .map((failure) => (
                  <li key={`${failure.kind}-${failure.name}`}>
                    {failure.name} · {t(groupErrorKey(failure.error))}
                  </li>
                ))}
            </ul>
            {groupConflict && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onReload}
                  disabled={busy}
                  className={buttonClass({ size: "sm" })}
                >
                  {t("conflict_reload")}
                </button>
                <button
                  type="button"
                  onClick={onGroupOverwrite}
                  disabled={busy}
                  className={buttonClass({ variant: "outline", size: "sm" })}
                >
                  {t("conflict_overwrite")}
                </button>
              </div>
            )}
          </Notice>
        )}

        {saveError !== null && (
          <div
            role="alert"
            className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2"
          >
            <p className="text-sm text-destructive">{saveError}</p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <p role="status" className="min-w-0 flex-1 text-sm text-destructive">
            {invalidCount > 0 &&
              (invalidCount === 1
                ? t("fix_fields_1")
                : t("fix_fields", { n: String(invalidCount) }))}
          </p>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className={buttonClass({ variant: "outline" })}
          >
            {t("cancel")}
          </button>
          <button type="button" onClick={onSave} disabled={busy} className={buttonClass()}>
            {saving ? (
              <>
                <SpinnerIcon />
                {t("saving")}
              </>
            ) : (
              t("save")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Notice({
  title,
  alert = false,
  children,
}: {
  title: string;
  alert?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role={alert ? "alert" : undefined}
      className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3"
    >
      <p className="text-sm font-bold text-destructive">{title}</p>
      {children}
    </div>
  );
}

/** Why a group change was not written, for the bottom bar. */
function groupErrorKey(err: unknown): TranslationKey {
  if (err instanceof DavError && err.code === "CONFLICT") return "group_err_conflict";
  if (err instanceof DavError && err.code === "NETWORK") return "group_err_network";
  if (err instanceof DavError && err.code === "TIMEOUT") return "group_err_timeout";
  if (err instanceof DavError && err.code === "AUTH") return "group_err_auth";
  return "group_err_refused";
}
