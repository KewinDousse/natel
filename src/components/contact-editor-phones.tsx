import type { Dispatch } from "react";
import { useI18n } from "@/i18n/react";
import type { ContactDraft } from "@/lib/contact-edit";
import type { DraftAction } from "@/lib/draft-reducer";
import { cn } from "@/lib/utils";
import { EditRow } from "./contact-editor-parts";
import {
  AddPill,
  appleLabelText,
  kindLabelKey,
  RemoveButton,
  Section,
  TypeSelect,
} from "./contact-fields";
import { fieldClass } from "./ui/button";
import { PhoneIcon } from "./ui/icons";

export function ContactEditorPhones({
  fields,
  dispatch,
  onAdd,
}: {
  fields: ContactDraft["tel"];
  dispatch: Dispatch<DraftAction>;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  return (
    <Section
      id="sec-tel"
      icon={<PhoneIcon />}
      title={t(fields.length > 1 ? "s_phones" : "s_phones_1")}
    >
      <div className="space-y-3 sm:space-y-2">
        {fields.map((field, i) => (
          <EditRow
            key={field.id}
            type={
              <TypeSelect
                field="tel"
                aria-label={t("label_tel_type")}
                value={field.type}
                label={field._orig.label}
                onChange={(value) => dispatch({ type: "SET_TEL_TYPE", index: i, value })}
              />
            }
            remove={
              <RemoveButton
                label={t("remove_tel")}
                onClick={() => dispatch({ type: "REMOVE_TEL", index: i })}
              />
            }
          >
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-label={`${t("label_tel")} (${field.type === "label" ? appleLabelText(field._orig.label ?? "", t) : t(kindLabelKey(field.type))})`}
              value={field.value}
              onChange={(e) => dispatch({ type: "SET_TEL", index: i, value: e.target.value })}
              className={fieldClass("h-11 tabular")}
            />
          </EditRow>
        ))}
      </div>
      <AddPill
        label={t("add_phone")}
        onClick={onAdd}
        className={cn("w-full justify-center", fields.length > 0 && "mt-3")}
      />
    </Section>
  );
}
