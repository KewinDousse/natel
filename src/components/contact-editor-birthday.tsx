import type { Dispatch } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import type { ContactDraft, ValidationErrors } from "@/lib/contact-edit";
import type { DraftAction } from "@/lib/draft-reducer";
import { cn } from "@/lib/utils";
import { ErrorText } from "./contact-editor-parts";
import { Section } from "./contact-fields";
import { fieldClass } from "./ui/button";
import { CakeIcon } from "./ui/icons";

export function ContactEditorBirthday({
  birthday,
  dispatch,
  errors,
  onBlurValidate,
}: {
  birthday: NonNullable<ContactDraft["bday"]>;
  dispatch: Dispatch<DraftAction>;
  errors: ValidationErrors;
  onBlurValidate: () => void;
}) {
  const { t } = useI18n();
  return (
    <Section id="sec-bday" icon={<CakeIcon />} title={t("s_bday")}>
      <div className="flex flex-wrap gap-2 py-1">
        {(
          [
            ["day", "SET_BDAY_DAY", "label_bday_day", "placeholder_bday_day", "w-16"],
            ["month", "SET_BDAY_MONTH", "label_bday_month", "placeholder_bday_month", "w-16"],
            ["year", "SET_BDAY_YEAR", "label_bday_year", "placeholder_bday_year", "w-24"],
          ] as const
        ).map(([part, action, label, placeholder, width]) => {
          const error = errors[`bday_${part}`];
          return (
            <div key={part}>
              <input
                type="text"
                inputMode="numeric"
                aria-label={t(label)}
                placeholder={t(placeholder)}
                value={birthday[part]}
                onChange={(e) => dispatch({ type: action, value: e.target.value })}
                onBlur={onBlurValidate}
                aria-invalid={error !== undefined || undefined}
                aria-describedby={error ? `err-bday-${part}` : undefined}
                className={fieldClass(cn("h-11 px-3 text-center", width))}
              />
              {error && <ErrorText id={`err-bday-${part}`}>{t(error as TranslationKey)}</ErrorText>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
