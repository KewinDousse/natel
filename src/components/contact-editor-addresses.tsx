import type { Dispatch } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import type { ContactDraft, ValidationErrors } from "@/lib/contact-edit";
import { addressKindOf } from "@/lib/contact-edit";
import type { DraftAction } from "@/lib/draft-reducer";
import { EditRow, ErrorText } from "./contact-editor-parts";
import { AddPill, RemoveButton, Section, TypeSelect } from "./contact-fields";
import { fieldClass } from "./ui/button";
import { MapPinIcon } from "./ui/icons";

export function ContactEditorAddresses({
  addresses,
  dispatch,
  errors,
  onAdd,
}: {
  addresses: ContactDraft["adr"];
  dispatch: Dispatch<DraftAction>;
  errors: ValidationErrors;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  return (
    <Section
      id="sec-adr"
      icon={<MapPinIcon />}
      title={t(addresses.length > 1 ? "s_addresses" : "s_address")}
    >
      <div className="space-y-5 sm:space-y-4">
        {addresses.map((adr, i) => (
          // Each address's fields share their names: the group tells them apart.
          <fieldset
            key={adr.id}
            aria-label={t("adr_group", { n: String(i + 1) })}
            className="min-w-0"
          >
            <EditRow
              type={
                <TypeSelect
                  field="adr"
                  aria-label={t("label_adr_type")}
                  value={addressKindOf(adr)}
                  label={adr.label}
                  custom
                  onChange={(value) => dispatch({ type: "SET_ADR_TYPE", index: i, value })}
                />
              }
              remove={
                <RemoveButton
                  label={t("remove_adr")}
                  onClick={() => dispatch({ type: "REMOVE_ADR", index: i })}
                />
              }
              error={
                errors[`adr_${i}`] && (
                  <ErrorText id={`err-adr-${i}`}>
                    {t(errors[`adr_${i}`] as TranslationKey)}
                  </ErrorText>
                )
              }
              wide
            >
              <div className="space-y-2">
                {adr.customLabel !== undefined && (
                  <input
                    type="text"
                    aria-label={t("label_adr_label")}
                    aria-invalid={errors[`adr_${i}`] !== undefined || undefined}
                    aria-describedby={errors[`adr_${i}`] ? `err-adr-${i}` : undefined}
                    placeholder={t("label_adr_label")}
                    value={adr.customLabel}
                    onChange={(e) =>
                      dispatch({ type: "SET_ADR_LABEL", index: i, value: e.target.value })
                    }
                    className={fieldClass("h-11")}
                  />
                )}
                <input
                  type="text"
                  aria-label={t("label_extended")}
                  placeholder={t("label_extended")}
                  autoComplete="address-line2"
                  value={adr.extended}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_ADR_PART",
                      index: i,
                      part: "extended",
                      value: e.target.value,
                    })
                  }
                  className={fieldClass("h-11")}
                />
                <input
                  type="text"
                  aria-label={t("label_street")}
                  placeholder={t("label_street")}
                  autoComplete="address-line1"
                  value={adr.street}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_ADR_PART",
                      index: i,
                      part: "street",
                      value: e.target.value,
                    })
                  }
                  className={fieldClass("h-11")}
                />
                <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={t("label_postal_code")}
                    placeholder={t("label_postal_code")}
                    autoComplete="postal-code"
                    value={adr.postalCode}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_ADR_PART",
                        index: i,
                        part: "postalCode",
                        value: e.target.value,
                      })
                    }
                    className={fieldClass("h-11")}
                  />
                  <input
                    type="text"
                    aria-label={t("label_locality")}
                    placeholder={t("label_locality")}
                    autoComplete="address-level2"
                    value={adr.locality}
                    onChange={(e) =>
                      dispatch({
                        type: "SET_ADR_PART",
                        index: i,
                        part: "locality",
                        value: e.target.value,
                      })
                    }
                    className={fieldClass("h-11")}
                  />
                </div>
                <input
                  type="text"
                  aria-label={t("label_country")}
                  placeholder={t("label_country")}
                  autoComplete="country-name"
                  value={adr.country}
                  onChange={(e) =>
                    dispatch({
                      type: "SET_ADR_PART",
                      index: i,
                      part: "country",
                      value: e.target.value,
                    })
                  }
                  className={fieldClass("h-11")}
                />
              </div>
            </EditRow>
          </fieldset>
        ))}
      </div>
      <AddPill label={t("add_address")} onClick={onAdd} className="mt-3 w-full justify-center" />
    </Section>
  );
}
