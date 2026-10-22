import type { Dispatch } from "react";
import { useId } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import type { ContactDraft, ValidationErrors } from "@/lib/contact-edit";
import type { DraftAction } from "@/lib/draft-reducer";
import { usePreferences } from "@/store/preferences";
import { Field } from "./contact-editor-parts";
import { fieldClass } from "./ui/button";

export function ContactEditorIdentity({
  draft,
  dispatch,
  errors,
  onBlurValidate,
}: {
  draft: ContactDraft;
  dispatch: Dispatch<DraftAction>;
  errors: ValidationErrors;
  onBlurValidate: () => void;
}) {
  const { t } = useI18n();
  const nameErrorId = useId();
  const nameInvalid = errors.name !== undefined;
  const sortBy = usePreferences((state) => state.sortBy);
  const nameOrder =
    sortBy === "given" ? (["given", "family"] as const) : (["family", "given"] as const);
  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      {nameOrder.map((part) => (
        <Field key={part} label={t(part === "family" ? "label_family" : "label_given")}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={draft[part]}
              autoComplete="off"
              onChange={(e) =>
                dispatch({
                  type: part === "family" ? "SET_FAMILY" : "SET_GIVEN",
                  value: e.target.value,
                })
              }
              onBlur={onBlurValidate}
              aria-invalid={nameInvalid || undefined}
              aria-describedby={nameInvalid ? nameErrorId : undefined}
              className={fieldClass("h-11")}
            />
          )}
        </Field>
      ))}
      {nameInvalid && (
        <p id={nameErrorId} className="col-span-2 -mt-1 text-sm text-destructive">
          {t(errors.name as TranslationKey)}
        </p>
      )}
      <Field label={t("label_org")}>
        {(id) => (
          <input
            id={id}
            type="text"
            value={draft.org}
            autoComplete="organization"
            onChange={(e) => dispatch({ type: "SET_ORG", value: e.target.value })}
            onBlur={onBlurValidate}
            aria-invalid={nameInvalid || undefined}
            aria-describedby={nameInvalid ? nameErrorId : undefined}
            className={fieldClass("h-11")}
          />
        )}
      </Field>
      <Field label={t("label_title")}>
        {(id) => (
          <input
            id={id}
            type="text"
            value={draft.title}
            onChange={(e) => dispatch({ type: "SET_TITLE", value: e.target.value })}
            className={fieldClass("h-11")}
          />
        )}
      </Field>
    </div>
  );
}
