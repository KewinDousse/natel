/**
 * ContactEditor — the contact page's edit form (DESIGN.md "Contact page"),
 * for a contact or a new one. The sections come in the reading view's order;
 * an optional one the card doesn't have waits as a "+ Ajouter" pill under the
 * form. The page around it owns the draft, the save and the dialogs.
 */

import { type Dispatch, type RefObject, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import { addressKindOf, type ContactDraft, type ValidationErrors } from "@/lib/contact-edit";
import type { DraftAction } from "@/lib/draft-reducer";
import { cn } from "@/lib/utils";
import type { Contact } from "@/model/contact";
import { usePreferences } from "@/store/preferences";
import { EditRow, ErrorText, Field, GroupsEditor } from "./contact-editor-parts";
import {
  AddPill,
  appleLabelText,
  kindLabelKey,
  RemoveButton,
  Section,
  TypeSelect,
} from "./contact-fields";
import { BuildingAvatar, InitialsAvatar, PhotoAvatar } from "./photo-avatar";
import { buttonClass, fieldClass } from "./ui/button";
import {
  ArrowRightIcon,
  CakeIcon,
  GlobeIcon,
  ImageIcon,
  MailIcon,
  MapPinIcon,
  NoteIcon,
  PhoneIcon,
  TagIcon,
  TrashIcon,
  UsersIcon,
} from "./ui/icons";

/** Optional sections the form shows only once they have something, or are asked for. */
type Optional = "url" | "nickname" | "note";

export function ContactEditor({
  contact,
  isNew,
  draft,
  dispatch,
  errors,
  onBlurValidate,
  groups,
  groupSuggestions,
  onGroupsChange,
  photo,
  unknownCount,
  onShowUnknown,
  move,
  onDelete,
  busy,
}: {
  contact: Contact;
  isNew: boolean;
  draft: ContactDraft;
  dispatch: Dispatch<DraftAction>;
  errors: ValidationErrors;
  onBlurValidate: () => void;
  /** The contact's groups as edited; none on a new contact. */
  groups: string[] | null;
  groupSuggestions: string[];
  onGroupsChange: (names: string[]) => void;
  photo: {
    canChange: boolean;
    shown: boolean;
    inputRef: RefObject<HTMLInputElement | null>;
    buttonRef: RefObject<HTMLButtonElement | null>;
    onFile: (file: File) => void;
  };
  /** Properties of the card the page doesn't show, kept as they are. */
  unknownCount: number;
  onShowUnknown: () => void;
  /** Absent on a new contact and when the account has a single book. */
  move?: { disabled: boolean; hint: boolean; onClick: () => void };
  /** Absent on a new contact. */
  onDelete?: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const moveHintId = useId();
  const nameErrorId = useId();
  const [opened, setOpened] = useState<Set<Optional>>(() => new Set());
  // What the card has shows at once; an empty section, once asked for.
  const shown = (section: Optional) =>
    opened.has(section) || contact.fields[section].length > 0 || draft[section].length > 0;
  const formRef = useRef<HTMLDivElement>(null);

  // A section asked for gets the focus, once it is on the page.
  const open = (section: Optional | "bday", sectionId: string) => {
    if (section === "bday") dispatch({ type: "ADD_BDAY" });
    else setOpened((current) => new Set(current).add(section));
    requestAnimationFrame(() => {
      const field = formRef.current?.querySelector<HTMLElement>(
        `#${sectionId} input, #${sectionId} textarea`,
      );
      field?.focus();
    });
  };

  // A new number or address goes under the others, focused.
  const addRow = (field: "tel" | "email") => {
    dispatch({ type: field === "tel" ? "ADD_TEL" : "ADD_EMAIL" });
    requestAnimationFrame(() => {
      const inputs = formRef.current?.querySelectorAll<HTMLElement>(`#sec-${field} input`);
      inputs?.[inputs.length - 1]?.focus();
    });
  };

  // A new address goes under the others, its street focused.
  const addAddress = () => {
    dispatch({ type: "ADD_ADR" });
    requestAnimationFrame(() => {
      const streets = formRef.current?.querySelectorAll<HTMLElement>(
        '#sec-adr input[autocomplete="address-line1"]',
      );
      streets?.[streets.length - 1]?.focus();
    });
  };

  const nameInvalid = errors.name !== undefined;
  // The name fields come in the order the list sorts by.
  const sortBy = usePreferences((state) => state.sortBy);
  const nameOrder =
    sortBy === "given" ? (["given", "family"] as const) : (["family", "given"] as const);
  const pills: { label: TranslationKey; show: boolean; onClick: () => void }[] = [
    { label: "add_address", show: draft.adr.length === 0, onClick: addAddress },
    { label: "add_bday", show: draft.bday === null, onClick: () => open("bday", "sec-bday") },
    { label: "add_url", show: !shown("url"), onClick: () => open("url", "sec-url") },
    {
      label: "add_nickname",
      show: !shown("nickname"),
      onClick: () => open("nickname", "sec-nickname"),
    },
    { label: "add_note", show: !shown("note"), onClick: () => open("note", "sec-note") },
  ];

  return (
    <div
      ref={formRef}
      className="mx-auto w-full max-w-[44rem] px-5 pb-28 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <PhotoAvatar
            contact={contact}
            edited={draft.photo}
            className="size-24 rounded-xl sm:size-28"
            fallback={
              // An organisation's card keeps its building, as in the reading view.
              !draft.family.trim() && !draft.given.trim() && draft.org.trim() ? (
                <BuildingAvatar className="size-24 rounded-xl sm:size-28" />
              ) : (
                <InitialsAvatar
                  family={draft.family}
                  given={draft.given}
                  seed={contact.uid || contact.href}
                  className="size-24 rounded-xl text-5xl sm:size-28"
                />
              )
            }
          />
          {(photo.canChange || photo.shown) && (
            <div className="flex flex-col items-start gap-2">
              {photo.canChange && (
                <>
                  <button
                    ref={photo.buttonRef}
                    type="button"
                    onClick={() => photo.inputRef.current?.click()}
                    className={buttonClass({ variant: "outline", size: "sm" }, "pl-2.5")}
                  >
                    <ImageIcon />
                    {t("photo_change")}
                  </button>
                  <input
                    ref={photo.inputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      // Choosing the same file again should reopen the dialog.
                      event.target.value = "";
                      if (file) photo.onFile(file);
                    }}
                  />
                </>
              )}
              {photo.shown && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: "SET_PHOTO", value: { kind: "removed" } })}
                  className={buttonClass({ variant: "outline", size: "sm" }, "pl-2.5")}
                >
                  <TrashIcon className="size-4" />
                  {t("photo_remove")}
                </button>
              )}
            </div>
          )}
        </div>
        <span className="hidden h-10 items-center text-sm font-bold text-muted-foreground lg:inline-flex">
          {isNew ? t("new_contact") : t("edit_label")}
        </span>
      </div>

      {/* Two by two on phones too: they open the form, so they keep it short. */}
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

      <div className="mt-8 space-y-6">
        <Section
          id="sec-tel"
          icon={<PhoneIcon />}
          title={t(draft.tel.length > 1 ? "s_phones" : "s_phones_1")}
        >
          <div className="space-y-3 sm:space-y-2">
            {draft.tel.map((field, i) => (
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
            onClick={() => addRow("tel")}
            className={cn("w-full justify-center", draft.tel.length > 0 && "mt-3")}
          />
        </Section>

        <Section
          id="sec-email"
          icon={<MailIcon />}
          title={t(draft.email.length > 1 ? "s_emails" : "s_emails_1")}
        >
          <div className="space-y-3 sm:space-y-2">
            {draft.email.map((field, i) => {
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
                    error && (
                      <ErrorText id={`err-email-${i}`}>{t(error as TranslationKey)}</ErrorText>
                    )
                  }
                >
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    aria-label={`${t("label_email")} (${field.type === "label" ? appleLabelText(field._orig.label ?? "", t) : t(kindLabelKey(field.type))})`}
                    value={field.value}
                    onChange={(e) =>
                      dispatch({ type: "SET_EMAIL", index: i, value: e.target.value })
                    }
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
            onClick={() => addRow("email")}
            className={cn("w-full justify-center", draft.email.length > 0 && "mt-3")}
          />
        </Section>

        {draft.adr.length > 0 && (
          <Section
            id="sec-adr"
            icon={<MapPinIcon />}
            title={t(draft.adr.length > 1 ? "s_addresses" : "s_address")}
          >
            <div className="space-y-5 sm:space-y-4">
              {draft.adr.map((adr, i) => (
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
            <AddPill
              label={t("add_address")}
              onClick={addAddress}
              className="mt-3 w-full justify-center"
            />
          </Section>
        )}

        {draft.bday !== null && (
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
                      value={draft.bday?.[part] ?? ""}
                      onChange={(e) => dispatch({ type: action, value: e.target.value })}
                      onBlur={onBlurValidate}
                      aria-invalid={error !== undefined || undefined}
                      aria-describedby={error ? `err-bday-${part}` : undefined}
                      className={fieldClass(cn("h-11 px-3 text-center", width))}
                    />
                    {error && (
                      <ErrorText id={`err-bday-${part}`}>{t(error as TranslationKey)}</ErrorText>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {groups !== null && (
          <Section icon={<UsersIcon />} title={t("s_groups")}>
            <GroupsEditor names={groups} suggestions={groupSuggestions} onChange={onGroupsChange} />
          </Section>
        )}

        {shown("url") && (
          <Section id="sec-url" icon={<GlobeIcon />} title={t("s_url")}>
            <EditRow
              type={
                <TypeSelect
                  field="url"
                  aria-label={t("label_url_type")}
                  value={draft.urlType ?? ""}
                  label={contact.fields.urlField?.label}
                  onChange={(value) => dispatch({ type: "SET_URL_TYPE", value })}
                />
              }
            >
              <input
                type="url"
                inputMode="url"
                autoComplete="url"
                aria-label={t("label_url")}
                value={draft.url}
                onChange={(e) => dispatch({ type: "SET_URL", value: e.target.value })}
                onBlur={onBlurValidate}
                aria-invalid={errors.url !== undefined || undefined}
                aria-describedby={errors.url ? "err-url" : undefined}
                className={fieldClass("h-11")}
              />
            </EditRow>
            {errors.url && <ErrorText id="err-url">{t(errors.url as TranslationKey)}</ErrorText>}
          </Section>
        )}

        {shown("nickname") && (
          <Section id="sec-nickname" icon={<TagIcon />} title={t("s_nickname")}>
            <input
              type="text"
              aria-label={t("s_nickname")}
              value={draft.nickname}
              onChange={(e) => dispatch({ type: "SET_NICKNAME", value: e.target.value })}
              className={fieldClass("h-11")}
            />
          </Section>
        )}

        {shown("note") && (
          <Section id="sec-note" icon={<NoteIcon />} title={t("s_note")}>
            <textarea
              aria-label={t("s_note")}
              value={draft.note}
              onChange={(e) => dispatch({ type: "SET_NOTE", value: e.target.value })}
              className={fieldClass("min-h-[6rem] resize-y py-2.5 leading-relaxed")}
            />
          </Section>
        )}
      </div>

      <div className="mt-8 space-y-5">
        {pills.some((pill) => pill.show) && (
          <div className="flex flex-wrap gap-2">
            {pills
              .filter((pill) => pill.show)
              .map((pill) => (
                <AddPill key={pill.label} label={t(pill.label)} onClick={pill.onClick} />
              ))}
          </div>
        )}
        {unknownCount > 0 && (
          <p className="text-sm text-muted-foreground">
            <button
              type="button"
              onClick={onShowUnknown}
              className="rounded-sm underline decoration-leader underline-offset-2 hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {unknownCount === 1
                ? t("preserved_fields_1")
                : t("preserved_fields", { n: String(unknownCount) })}
            </button>
          </p>
        )}
        {move && (
          <div>
            <button
              type="button"
              onClick={move.onClick}
              disabled={move.disabled}
              aria-describedby={move.hint ? moveHintId : undefined}
              className={buttonClass({ variant: "outline" }, "pl-3.5")}
            >
              <ArrowRightIcon />
              {t("move_contact")}
            </button>
            {move.hint && (
              <p id={moveHintId} className="mt-1.5 text-caption text-muted-foreground">
                {t("move_disabled_hint")}
              </p>
            )}
          </div>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className={buttonClass({ variant: "destructive" }, "pl-3.5")}
          >
            <TrashIcon />
            {t("delete_contact")}
          </button>
        )}
      </div>
    </div>
  );
}
