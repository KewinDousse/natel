import type { Dispatch } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import type { ContactDraft, ValidationErrors } from "@/lib/contact-edit";
import type { DraftAction } from "@/lib/draft-reducer";
import { cn } from "@/lib/utils";
import { EditRow, ErrorText } from "./contact-editor-parts";
import {
  AddPill,
  appleLabelText,
  kindLabelKey,
  RemoveButton,
  Section,
  TypeSelect,
} from "./contact-fields";
import { fieldClass } from "./ui/button";
import { MailIcon } from "./ui/icons";

export function ContactEditorEmails({
  fields,
  dispatch,
  errors,
  onBlurValidate,
  onAdd,
}: {
  fields: ContactDraft["email"];
  dispatch: Dispatch<DraftAction>;
  errors: ValidationErrors;
  onBlurValidate: () => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  return (
    <Section
      id="sec-email"
      icon={<MailIcon />}
      title={t(fields.length > 1 ? "s_emails" : "s_emails_1")}
    >
      <div className="space-y-3 sm:space-y-2">
        {fields.map((field, i) => {
          const error = errors[`email_${i}`];
          return (
            <EditRow
              key={field.id}
              type={
                <TypeSelect
                  field="email"
                  aria-label={t("label_email_type")}
                  value={field.type}
                  label={field._orig.label}
                  onChange={(value) => dispatch({ type: "SET_EMAIL_TYPE", index: i, value })}
                />
              }
              remove={
                <RemoveButton
                  label={t("remove_email")}
                  onClick={() => dispatch({ type: "REMOVE_EMAIL", index: i })}
                />
              }
              error={
                error && <ErrorText id={`err-email-${i}`}>{t(error as TranslationKey)}</ErrorText>
              }
            >
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                aria-label={`${t("label_email")} (${field.type === "label" ? appleLabelText(field._orig.label ?? "", t) : t(kindLabelKey(field.type))})`}
                value={field.value}
                onChange={(e) => dispatch({ type: "SET_EMAIL", index: i, value: e.target.value })}
                onBlur={onBlurValidate}
                aria-invalid={error !== undefined || undefined}
                aria-describedby={error ? `err-email-${i}` : undefined}
                className={fieldClass("h-11")}
              />
            </EditRow>
          );
        })}
      </div>
      <AddPill
        label={t("add_email")}
        onClick={onAdd}
        className={cn("w-full justify-center", fields.length > 0 && "mt-3")}
      />
    </Section>
  );
}
