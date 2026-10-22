import type { Dispatch, RefObject } from "react";
import { useI18n } from "@/i18n/react";
import type { ContactDraft } from "@/lib/contact-edit";
import type { DraftAction } from "@/lib/draft-reducer";
import type { Contact } from "@/model/contact";
import { BuildingAvatar, InitialsAvatar, PhotoAvatar } from "./photo-avatar";
import { buttonClass } from "./ui/button";
import { ImageIcon, TrashIcon } from "./ui/icons";
export type EditorPhoto = {
  canChange: boolean;
  shown: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onFile: (file: File) => void;
};

export function ContactEditorPhoto({
  contact,
  draft,
  dispatch,
  isNew,
  photo,
}: {
  contact: Contact;
  draft: ContactDraft;
  dispatch: Dispatch<DraftAction>;
  isNew: boolean;
  photo: EditorPhoto;
}) {
  const { t } = useI18n();
  return (
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
  );
}
