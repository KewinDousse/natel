/**
 * ContactEditor — the contact page's edit form (DESIGN.md "Contact page"),
 * for a contact or a new one. The sections come in the reading view's order;
 * an optional one the card doesn't have waits as a "+ Ajouter" pill under the
 * form. The page around it owns the draft, the save and the dialogs.
 */

import { type Dispatch, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import type { ContactDraft, ValidationErrors } from "@/lib/contact-edit";
import type { DraftAction } from "@/lib/draft-reducer";
import type { Contact } from "@/model/contact";
import { ContactEditorAddresses } from "./contact-editor-addresses";
import { ContactEditorBirthday } from "./contact-editor-birthday";
import { ContactEditorEmails } from "./contact-editor-emails";
import { ContactEditorIdentity } from "./contact-editor-identity";
import { EditRow, ErrorText, GroupsEditor } from "./contact-editor-parts";
import { ContactEditorPhones } from "./contact-editor-phones";
import { ContactEditorPhoto, type EditorPhoto } from "./contact-editor-photo";
import { AddPill, Section, TypeSelect } from "./contact-fields";
import { buttonClass, fieldClass } from "./ui/button";
import { ArrowRightIcon, GlobeIcon, NoteIcon, TagIcon, TrashIcon, UsersIcon } from "./ui/icons";

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
  photo: EditorPhoto;
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
      <ContactEditorPhoto
        contact={contact}
        draft={draft}
        dispatch={dispatch}
        isNew={isNew}
        photo={photo}
      />

      <ContactEditorIdentity
        draft={draft}
        dispatch={dispatch}
        errors={errors}
        onBlurValidate={onBlurValidate}
      />

      <div className="mt-8 space-y-6">
        <ContactEditorPhones fields={draft.tel} dispatch={dispatch} onAdd={() => addRow("tel")} />
        <ContactEditorEmails
          fields={draft.email}
          dispatch={dispatch}
          errors={errors}
          onBlurValidate={onBlurValidate}
          onAdd={() => addRow("email")}
        />
        {draft.adr.length > 0 && (
          <ContactEditorAddresses
            addresses={draft.adr}
            dispatch={dispatch}
            errors={errors}
            onAdd={addAddress}
          />
        )}
        {draft.bday !== null && (
          <ContactEditorBirthday
            birthday={draft.bday}
            dispatch={dispatch}
            errors={errors}
            onBlurValidate={onBlurValidate}
          />
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
