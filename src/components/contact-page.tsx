/**
 * ContactPage — the contact detail page in view and edit mode, per DESIGN.md
 * "Contact page: one skeleton, two states".
 *
 * Renders inside the detail pane's Outlet. The same route/page toggles
 * data-mode view⇄edit; `?edit` in the URL reflects and drives it.
 * NewContactPage is the same page on a blank card, in edit mode only.
 */

import { useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useRouter } from "@tanstack/react-router";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import {
  applyDraft,
  buildDraft,
  type ContactDraft,
  dirtyDiff,
  isDirty,
  isValid,
  isWebUrl,
  nextId,
  rebaseDraft,
  replaceFirstType,
  type ValidationErrors,
  validateDraft,
} from "@/lib/contact-edit";
import { bookGroupNames, contactGroupNames } from "@/lib/contact-groups";
import {
  contactById,
  contactIdOf,
  isUnnamed,
  namePartsOf,
  primaryNumberOf,
} from "@/lib/contact-list";
import { birthdayDateTime, formatBirthday } from "@/lib/format-birthday";
import { formatPhone } from "@/lib/format-phone";
import { decodeImage, PhotoError } from "@/lib/photo-prepare";
import { isDialogOpen, isInMenu, isPlainKey, isTyping } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { bookName } from "@/lib/vcf-file";
import type { Contact, ContactField, PhotoEdit } from "@/model/contact";
import {
  createGroupCard,
  type DavAddressBook,
  type DavAuth,
  DavError,
  type GroupFailure,
  groupDelta,
  hasGroupChanges,
  type LoadFullBookResult,
  moveContact,
  overwriteGroupChange,
  useAddressBooks,
  useCreateContact,
  useDeleteContact,
  useRefetchCard,
  useUpdateContact,
  writeGroupChanges,
} from "@/queries";
import { contactsKey } from "@/queries/keys";
import { useAuth, useSelectedBook, useSessionStore } from "@/store/session";
import {
  addressOf,
  birthdayOf,
  canReplacePhoto,
  ensureUid,
  groupsOf,
  jobTitleOf,
  newContact,
  noteOf,
  orgOf,
  parse,
  photoOf,
  removeCategory,
  typeValuesOf,
  type VCardAddress,
} from "@/vcard";
import { DemoMark } from "./demo-notice";
import { EditableCell } from "./editable-cell";
import { MoveDialog } from "./move-dialog";
import { PhotoAvatar } from "./photo-avatar";
import { type ChosenPhoto, PhotoCropDialog } from "./photo-crop-dialog";
import { useToast } from "./toast";

type ContactPageProps = {
  /** Contacts of the selected book; undefined while the book is loading. */
  contacts: Contact[] | undefined;
  /** Group cards of the selected book (ADR 022). */
  groupCards: Contact[];
  /** The /contacts/$id route parameter. */
  id: string;
  /** True when ?edit is in the URL. */
  edit?: boolean;
};

/**
 * The page for one contact. While the book is loading it renders nothing —
 * the same quiet blank the list pane shows. Once loaded, an id outside the
 * book gets an honest not-found state.
 */
export function ContactPage({ contacts, groupCards, id, edit = false }: ContactPageProps) {
  const auth = useAuth();
  // The contact shown last, and the id a save is moving it to. A UID given on
  // save changes the contact's id; the route and the cached card change in
  // different ticks, and in between the page keeps the card by its href.
  const shown = useRef<{ href: string; id: string; nextId?: string } | null>(null);
  if (contacts === undefined || auth === null) return null;
  let contact = contactById(contacts, id);
  const last = shown.current;
  if (contact === undefined && last && (id === last.id || id === last.nextId)) {
    contact = contacts.find((card) => card.href === last.href);
  }
  if (contact === undefined) return <NotFoundView />;
  if (contactIdOf(contact) === id) shown.current = { href: contact.href, id };
  const href = contact.href;
  // Keyed by contact so draft, errors and in-flight saves never carry over.
  return (
    <ContactFiche
      key={href}
      auth={auth}
      contact={contact}
      groupCards={groupCards}
      groupSuggestions={bookGroupNames(contacts, groupCards)}
      edit={edit}
      onIdChange={(nextId) => {
        shown.current = { href, id: shown.current?.id ?? id, nextId };
      }}
    />
  );
}

/** The creation form: a blank card saved into the selected book. */
export function NewContactPage() {
  const auth = useAuth();
  const book = useSelectedBook();
  if (auth === null || book === null) return null;
  return <NewContactFiche auth={auth} bookHref={book.href} />;
}

function NewContactFiche({ auth, bookHref }: { auth: DavAuth; bookHref: string }) {
  const createContact = useCreateContact(auth, bookHref);
  const [contact] = useState(newContact);
  return (
    <ContactFiche
      auth={auth}
      contact={contact}
      groupCards={[]}
      groupSuggestions={[]}
      edit
      onCreate={createContact.mutateAsync}
    />
  );
}

// ---------------------------------------------------------------------------
// Mobile top bar
// ---------------------------------------------------------------------------

/**
 * Mobile-only top bar. With `onEdit`, the right slot stacks the "Modifier" pill
 * (view) and the "Modification" label (edit) in one cell so neither reflows;
 * the fiche's data-mode picks which one shows. With `label`, it shows that
 * text alone.
 */
export function MobileTopBar({ onEdit, label }: { onEdit?: () => void; label?: string }) {
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-20 flex h-14 items-center border-b bg-muted/95 px-2 backdrop-blur lg:hidden">
      <Link
        to="/contacts"
        activeOptions={{ exact: true }}
        aria-label={t("back_to_list")}
        className="inline-flex h-10 items-center gap-1.5 rounded-full pl-2 pr-3 text-sm font-bold hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted"
      >
        <ChevronLeftIcon />
        <span>{t("list_label")}</span>
      </Link>
      <DemoMark className="ml-1" />
      {onEdit !== undefined && (
        <div className="ml-auto mr-1 grid [&>*]:[grid-area:1/1]">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-data-[mode=edit]/fiche:invisible group-data-[mode=edit]/fiche:opacity-0"
          >
            {t("edit")}
          </button>
          <span className="invisible inline-flex h-9 items-center justify-center text-sm font-bold text-muted-foreground opacity-0 transition-opacity group-data-[mode=edit]/fiche:visible group-data-[mode=edit]/fiche:opacity-100">
            {t("edit_label")}
          </span>
        </div>
      )}
      {label !== undefined && (
        <span className="ml-auto mr-3 text-sm font-bold text-muted-foreground">{label}</span>
      )}
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      className="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Not-found state
// ---------------------------------------------------------------------------

function NotFoundView() {
  const { t } = useI18n();
  return (
    <>
      <MobileTopBar />
      <div className="mx-auto w-full max-w-[44rem] px-5 pb-10 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14">
        <div className="px-4 py-14 text-center">
          <p className="font-display text-3xl font-bold leading-tight">{t("contact_not_found")}</p>
          <p className="mt-2 text-sm leading-snug text-muted-foreground">
            {t("contact_not_found_body")}
          </p>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Draft reducer
// ---------------------------------------------------------------------------

type DraftAction =
  | { type: "REBUILD"; draft: ContactDraft }
  | { type: "ADD_TEL" }
  | { type: "ADD_EMAIL" }
  | { type: "SET_FAMILY"; value: string }
  | { type: "SET_GIVEN"; value: string }
  | { type: "SET_TEL"; index: number; value: string }
  | { type: "SET_TEL_TYPE"; index: number; value: string }
  | { type: "REMOVE_TEL"; index: number }
  | { type: "SET_EMAIL"; index: number; value: string }
  | { type: "SET_EMAIL_TYPE"; index: number; value: string }
  | { type: "REMOVE_EMAIL"; index: number }
  | { type: "SET_NICKNAME"; value: string }
  | { type: "SET_ADR_TYPE"; value: string }
  | { type: "SET_ADR_STREET"; value: string }
  | { type: "SET_ADR_POSTAL_CODE"; value: string }
  | { type: "SET_ADR_LOCALITY"; value: string }
  | { type: "SET_ADR_COUNTRY"; value: string }
  | { type: "ADD_ADR" }
  | { type: "SET_BDAY_YEAR"; value: string }
  | { type: "SET_BDAY_MONTH"; value: string }
  | { type: "SET_BDAY_DAY"; value: string }
  | { type: "ADD_BDAY" }
  | { type: "SET_ORG"; value: string }
  | { type: "SET_TITLE"; value: string }
  | { type: "SET_URL"; value: string }
  | { type: "SET_NOTE"; value: string }
  | { type: "SET_PHOTO"; value: PhotoEdit };

function draftReducer(state: ContactDraft, action: DraftAction): ContactDraft {
  switch (action.type) {
    case "REBUILD":
      return { ...action.draft };
    case "ADD_TEL":
      return {
        ...state,
        tel: [...state.tel, { id: nextId(), value: "", type: "", _orig: { value: "" } }],
      };
    case "ADD_EMAIL":
      return {
        ...state,
        email: [...state.email, { id: nextId(), value: "", type: "", _orig: { value: "" } }],
      };
    case "SET_FAMILY":
      return { ...state, family: action.value };
    case "SET_GIVEN":
      return { ...state, given: action.value };
    case "SET_TEL": {
      const tel = [...state.tel];
      const item = tel[action.index];
      if (item) tel[action.index] = { ...item, value: action.value };
      return { ...state, tel };
    }
    case "SET_TEL_TYPE": {
      const tel = [...state.tel];
      const item = tel[action.index];
      if (item) tel[action.index] = { ...item, type: action.value };
      return { ...state, tel };
    }
    case "REMOVE_TEL": {
      return { ...state, tel: state.tel.filter((_, i) => i !== action.index) };
    }
    case "SET_EMAIL": {
      const email = [...state.email];
      const item = email[action.index];
      if (item) email[action.index] = { ...item, value: action.value };
      return { ...state, email };
    }
    case "SET_EMAIL_TYPE": {
      const email = [...state.email];
      const item = email[action.index];
      if (item) email[action.index] = { ...item, type: action.value };
      return { ...state, email };
    }
    case "REMOVE_EMAIL": {
      return { ...state, email: state.email.filter((_, i) => i !== action.index) };
    }
    case "SET_NICKNAME":
      return { ...state, nickname: action.value };
    case "SET_ADR_TYPE":
      if (!state.adr) return state;
      return {
        ...state,
        adr: { ...state.adr, type: replaceFirstType(state.adr.type, action.value) },
      };
    case "SET_ADR_STREET":
      return { ...state, adr: state.adr ? { ...state.adr, street: action.value } : null };
    case "SET_ADR_POSTAL_CODE":
      return { ...state, adr: state.adr ? { ...state.adr, postalCode: action.value } : null };
    case "SET_ADR_LOCALITY":
      return { ...state, adr: state.adr ? { ...state.adr, locality: action.value } : null };
    case "SET_ADR_COUNTRY":
      return { ...state, adr: state.adr ? { ...state.adr, country: action.value } : null };
    case "ADD_ADR":
      if (state.adr) return state;
      return {
        ...state,
        adr: {
          poBox: "",
          extended: "",
          street: "",
          locality: "",
          region: "",
          postalCode: "",
          country: "",
          type: [],
          extraParts: [],
        },
      };
    case "SET_BDAY_YEAR":
      return { ...state, bday: state.bday ? { ...state.bday, year: action.value } : null };
    case "SET_BDAY_MONTH":
      return { ...state, bday: state.bday ? { ...state.bday, month: action.value } : null };
    case "SET_BDAY_DAY":
      return { ...state, bday: state.bday ? { ...state.bday, day: action.value } : null };
    case "ADD_BDAY":
      if (state.bday) return state;
      return {
        ...state,
        bday: { source: "", year: "", month: "", day: "" },
      };
    case "SET_ORG":
      return { ...state, org: action.value };
    case "SET_TITLE":
      return { ...state, title: action.value };
    case "SET_URL":
      return { ...state, url: action.value };
    case "SET_NOTE":
      return { ...state, note: action.value };
    case "SET_PHOTO":
      return { ...state, photo: action.value };
  }
}

// ---------------------------------------------------------------------------
// The fiche — view and edit states
// ---------------------------------------------------------------------------

/** Shared box sizing for value cells. */
const TEXT = "text-base lg:text-[0.9375rem]";

/** Name cells: larger fixed heights, display typeface. */
const NAME_FRAME =
  "h-12 font-display text-[2.25rem] font-bold leading-none tracking-[-0.005em] sm:h-14 sm:text-[2.75rem] lg:h-15 lg:text-person";

const EDITABLE_PROP_NAMES = [
  "fn",
  "n",
  "tel",
  "email",
  "nickname",
  "adr",
  "bday",
  "org",
  "title",
  "url",
  "note",
  "photo",
  "logo",
];

function countUnknownProperties(raw: Contact["raw"]): number {
  const known = new Set(EDITABLE_PROP_NAMES.map((n) => n.toLowerCase()));
  let count = 0;
  for (const prop of raw.getAllProperties()) {
    const jcal = prop.toJSON() as [string, unknown, unknown, unknown];
    const name = jcal[0].toLowerCase();
    if (["version", "begin", "end", "uid", "rev", "prodid", "categories"].includes(name)) continue;
    if (!known.has(name)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// View/edit mode navigation helper
// ---------------------------------------------------------------------------

/**
 * Custom component that manages edit state for a single contact.
 * Extracted as a separate component so hooks are in a stable order.
 * With `onCreate`, the contact is not on the server yet: saving creates it,
 * and cancelling goes back to the list.
 */
function ContactFiche({
  auth,
  contact,
  groupCards,
  groupSuggestions,
  edit,
  onCreate,
  onIdChange,
}: {
  auth: DavAuth;
  contact: Contact;
  groupCards: Contact[];
  /** Every group name of the book, for "Ajouter un groupe". */
  groupSuggestions: string[];
  edit: boolean;
  onCreate?: (contact: Contact) => Promise<Contact>;
  /** Called before a save moves the contact to another id. */
  onIdChange?: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const isNew = onCreate !== undefined;
  const updateContact = useUpdateContact(auth);
  const deleteContact = useDeleteContact(auth);
  const refetchCard = useRefetchCard(auth);
  const queryClient = useQueryClient();

  // Derived display values (view mode)
  const parts = useMemo(() => namePartsOf(contact), [contact]);
  const orgOnly = parts.display.length === 0;
  const jobTitle = useMemo(() => jobTitleOf(contact), [contact]);
  const org = useMemo(() => orgOf(contact), [contact]);
  const unnamed = !isNew && isUnnamed(contact);
  const primary = useMemo(() => primaryNumberOf(contact), [contact]);
  const firstEmail = contact.fields.email[0];
  const address = useMemo(() => addressOf(contact), [contact]);
  const addressHasContent = useMemo(
    () =>
      address !== null &&
      [address.street, address.postalCode, address.locality, address.country].some(
        (part) => part.length > 0,
      ),
    [address],
  );
  const birthday = useMemo(() => birthdayOf(contact), [contact]);
  const note = useMemo(() => noteOf(contact), [contact]);
  const groups = useMemo(() => contactGroupNames(contact, groupCards), [contact, groupCards]);

  // Route id for navigation
  const routeId = contactIdOf(contact);

  // Edit state
  // The version the draft was built from. A background refetch can replace
  // `contact` while editing; writes still go against this version and its
  // ETag, so a change made elsewhere meanwhile comes back as a 412 instead of
  // being written over.
  const [editBase, setEditBase] = useState(contact);
  const initialDraft = useMemo(() => buildDraft(contact), [contact]);
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  // The draft as it is now, for a save that ends after it changed.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });
  const draftPrimary = useMemo(
    () => draft.tel.find((f) => f.type === "cell") ?? draft.tel[0],
    [draft.tel],
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [conflict, setConflict] = useState(false);
  // A 412 on delete or move: only reloading makes sense, there is no version
  // to push. The value picks the hint.
  const [deleteConflict, setDeleteConflict] = useState<"delete" | "move" | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "deleting" | "moving">("idle");
  const busy = saveStatus !== "idle";
  // Leaving edit mode drops an in-flight save's result, which is harmless;
  // a delete's or a move's result is not: the card would vanish with the
  // page left on it.
  const deleting = saveStatus === "deleting" || saveStatus === "moving";
  const selectedBook = useSelectedBook();
  const selectBook = useSessionStore((state) => state.selectBook);
  const booksQuery = useAddressBooks(auth);
  const otherBooks = useMemo(
    () => (booksQuery.data ?? []).filter((book) => book.href !== selectedBook?.href),
    [booksQuery.data, selectedBook],
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const showToast = useToast();
  const [showDiscard, setShowDiscard] = useState(false);
  const [chosenPhoto, setChosenPhoto] = useState<ChosenPhoto | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const changePhotoRef = useRef<HTMLButtonElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const moveHintId = useId();

  // Dirty detection
  // Group names are edited beside the draft: the base is the names at the
  // start of the edit, the draft the names shown; a save writes the delta.
  const [editGroups, setEditGroups] = useState(groups);
  const [draftGroups, setDraftGroups] = useState(groups);
  const [groupFailures, setGroupFailures] = useState<GroupFailure[]>([]);
  // Group cards whose create failed, by name, until written or dropped: a
  // retry writes the same card again, so a create that did land isn't doubled.
  const groupRetries = useRef(new Map<string, Contact>());
  const delta = useMemo(() => groupDelta(editGroups, draftGroups), [editGroups, draftGroups]);

  const dirty = useMemo(() => dirtyDiff(editBase, draft), [editBase, draft]);
  const hasChanges = isDirty(dirty) || hasGroupChanges(delta);

  // Draft and base are taken from the current version when edit mode starts,
  // and deliberately not refreshed while editing.
  const prevEdit = useRef(edit);
  useEffect(() => {
    if (edit && !prevEdit.current) {
      setEditBase(contact);
      dispatch({ type: "REBUILD", draft: buildDraft(contact) });
      setEditGroups(groups);
      setDraftGroups(groups);
      setGroupFailures([]);
      groupRetries.current = new Map();
    }
    prevEdit.current = edit;
  }, [edit, contact, groups]);

  // Exit edit mode
  // Bumped whenever edit mode ends, so a save that settles afterwards is ignored.
  const editSession = useRef(0);
  useEffect(
    () => () => {
      editSession.current++;
    },
    [],
  );

  // The decoded image and its object URL go with the dialog.
  useEffect(() => {
    if (chosenPhoto === null || !("bitmap" in chosenPhoto)) return;
    return () => {
      chosenPhoto.bitmap.close();
      URL.revokeObjectURL(chosenPhoto.url);
    };
  }, [chosenPhoto]);

  // A large image decodes slowly: a result that lands after edit mode ended is dropped.
  const handlePhotoFile = useCallback(async (file: File) => {
    const session = editSession.current;
    let chosen: ChosenPhoto;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const bitmap = await decodeImage(file);
      if (session !== editSession.current) {
        bitmap.close();
        return;
      }
      chosen = { bytes, bitmap, url: URL.createObjectURL(file) };
    } catch (err) {
      chosen = { error: err instanceof PhotoError ? err : new PhotoError("UNDECODABLE", err) };
    }
    if (session === editSession.current) setChosenPhoto(chosen);
  }, []);

  // `savedId` is the contact to land on after a save; without it, a new
  // contact has nothing to show and goes back to the list.
  const exitEdit = useCallback(
    (savedId?: string) => {
      editSession.current++;
      dispatch({ type: "REBUILD", draft: buildDraft(contact) });
      setDraftGroups(groups);
      setGroupFailures([]);
      setErrors({});
      setConflict(false);
      setDeleteConflict(null);
      setShowDelete(false);
      setShowMove(false);
      setChosenPhoto(null);
      setSaveError(null);
      setSaveStatus("idle");
      if (isNew && savedId === undefined) {
        router.navigate({ to: "/contacts", replace: true, ignoreBlocker: true });
        return;
      }
      router.navigate({
        to: "/contacts/$id",
        params: { id: savedId ?? routeId },
        search: {},
        replace: true,
        ignoreBlocker: true,
      });
    },
    [contact, groups, router, routeId, isNew],
  );

  // Toggle edit mode with no-reflow safety net
  const handleToggleEdit = useCallback(() => {
    if (!edit && anchorRef.current) {
      const top = anchorRef.current.getBoundingClientRect().top;
      router.navigate({
        to: "/contacts/$id",
        params: { id: routeId },
        search: { edit: true },
        replace: true,
      });
      requestAnimationFrame(() => {
        const diff = anchorRef.current?.getBoundingClientRect().top ?? top;
        window.scrollBy(0, diff - top);
      });
    } else {
      exitEdit();
    }
  }, [edit, router, exitEdit, routeId]);

  // Enter edit focused on a section
  const enterEditFocused = useCallback(
    (sectionId: string) => {
      if (edit) return;
      if (anchorRef.current) {
        const top = anchorRef.current.getBoundingClientRect().top;
        router.navigate({
          to: "/contacts/$id",
          params: { id: routeId },
          search: { edit: true },
          replace: true,
        });
        requestAnimationFrame(() => {
          const diff = anchorRef.current?.getBoundingClientRect().top ?? top;
          window.scrollBy(0, diff - top);
          const section = document.getElementById(sectionId);
          if (section) {
            const input = section.querySelector("input, select, textarea") as HTMLElement | null;
            input?.focus({ preventScroll: true });
          }
        });
      }
    },
    [edit, router, routeId],
  );

  // E key to enter edit
  useEffect(() => {
    if (edit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || !isPlainKey(e) || isTyping(e.target) || isInMenu(e.target)) return;
      if (isDialogOpen()) return;
      if (e.key === "e" || e.key === "E") handleToggleEdit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [edit, handleToggleEdit]);

  // Cancel / Esc
  const handleCancel = useCallback(() => {
    if (hasChanges) {
      setShowDiscard(true);
    } else {
      exitEdit();
    }
  }, [hasChanges, exitEdit]);

  // History blocker — intercept back/forward when dirty using TanStack Router's blocker API
  const blocker = useBlocker({
    shouldBlockFn: () => hasChanges,
    enableBeforeUnload: () => hasChanges,
    disabled: !edit,
    withResolver: true,
  });

  // When the blocker fires, show the discard dialog
  const blockerActive = blocker?.status === "blocked";
  useEffect(() => {
    if (blockerActive) {
      setShowDelete(false);
      setShowMove(false);
      setChosenPhoto(null);
      setShowDiscard(true);
    }
  }, [blockerActive]);

  const closeDiscard = useCallback(() => {
    setShowDiscard(false);
    if (blockerActive) blocker?.reset?.();
  }, [blockerActive, blocker]);

  // Esc closes the open dialog (photo, delete, move or discard), otherwise it
  // cancels editing; not while a delete is in flight.
  useEffect(() => {
    if (!edit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || deleting) return;
      if (chosenPhoto !== null) {
        setChosenPhoto(null);
      } else if (showDelete) {
        setShowDelete(false);
      } else if (showMove) {
        setShowMove(false);
      } else if (showDiscard) {
        closeDiscard();
      } else {
        handleCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [edit, deleting, chosenPhoto, showDelete, showMove, showDiscard, closeDiscard, handleCancel]);

  // Validate on blur
  const handleBlurValidate = useCallback(() => {
    setErrors(validateDraft(draft));
  }, [draft]);

  // Puts the group cards written (ADR 022) into the book's cached groups.
  const cacheGroupCards = useCallback(
    (written: Contact[]) => {
      if (written.length === 0 || !selectedBook) return;
      queryClient.setQueryData<LoadFullBookResult>(contactsKey(auth, selectedBook), (old) => {
        if (!old) return old;
        const byHref = new Map(old.groups.map((card) => [card.href, card]));
        for (const card of written) byHref.set(card.href, card);
        return { ...old, groups: [...byHref.values()] };
      });
    },
    [auth, selectedBook, queryClient],
  );

  // After the contact's card: its group changes, then the end of the save.
  // Group changes that fail leave the save in place and stay pending, in
  // edit mode, with the bottom bar saying which and why.
  const finishSave = useCallback(
    async (
      saved: Contact,
      savedId: string,
      session: number,
      pending: typeof delta,
      sent: ContactDraft,
    ) => {
      // Staying in edit mode on the saved card: the draft follows it, keeping
      // only what was typed during the save.
      const keepEditing = () => {
        setEditBase(saved);
        dispatch({ type: "REBUILD", draft: rebaseDraft(sent, draftRef.current, saved) });
      };
      if (hasGroupChanges(pending) && !selectedBook) {
        keepEditing();
        setSaveError(t("err_save_unexpected"));
        setSaveStatus("idle");
        return;
      }
      if (hasGroupChanges(pending) && selectedBook) {
        const retries = groupRetries.current;
        const { written, failures } = await writeGroupChanges(
          auth,
          selectedBook.href,
          saved.uid,
          pending,
          groupCards,
          retries,
        );
        // What the server took belongs in the cache even once the edit is gone.
        cacheGroupCards(written);
        if (session !== editSession.current) return;
        for (const name of pending.added) retries.delete(name);
        for (const f of failures) if (f.newCard) retries.set(f.name, f.newCard);
        const failedAdded = failures.filter((f) => f.kind === "add").map((f) => f.name);
        const failedRemoved = failures.filter((f) => f.kind === "remove").map((f) => f.name);
        setEditGroups((base) => [
          ...base.filter((name) => !pending.removed.includes(name) || failedRemoved.includes(name)),
          ...pending.added.filter((name) => !failedAdded.includes(name)),
        ]);
        if (failures.length > 0) {
          keepEditing();
          setGroupFailures(failures);
          setSaveStatus("idle");
          return;
        }
      }
      showToast(t("saved"));
      exitEdit(savedId);
    },
    [auth, selectedBook, groupCards, cacheGroupCards, showToast, t, exitEdit],
  );

  // Runs one save attempt and maps its outcome onto the bottom bar. `put`
  // writes the contact's card and resolves to the saved version, or to null
  // when nothing on it changed. Results that settle after edit mode has
  // ended are dropped.
  const runSave = useCallback(
    async (sent: ContactDraft, put: () => Promise<Contact | null>) => {
      const session = editSession.current;
      const pending = delta;
      setSaveStatus("saving");
      setSaveError(null);
      setConflict(false);
      setDeleteConflict(null);
      setGroupFailures([]);
      let saved: Contact;
      try {
        saved = (await put()) ?? editBase;
      } catch (err) {
        if (session !== editSession.current) return;
        setSaveStatus("idle");
        // A 412 on a create means a card already has this UID's href, most
        // likely an earlier attempt whose answer was lost: reload/overwrite
        // would make no sense, the list should be reloaded instead.
        if (err instanceof DavError && err.code === "CONFLICT") {
          if (isNew) setSaveError(t("err_create_exists"));
          else setConflict(true);
        } else {
          setSaveError(t(writeErrorKey(err, "save")));
        }
        return;
      }
      if (session !== editSession.current) return;
      const savedId = contactIdOf(saved);
      // A UID given for a first group changes the contact's route: the page
      // (keyed by href) follows it while the group cards are written.
      if (!isNew && savedId !== routeId) {
        onIdChange?.(savedId);
        router.navigate({
          to: "/contacts/$id",
          params: { id: savedId },
          search: { edit: true },
          replace: true,
          ignoreBlocker: true,
        });
      }
      await finishSave(saved, savedId, session, pending, sent);
    },
    [t, isNew, delta, editBase, finishSave, router, routeId, onIdChange],
  );

  // What the contact's own card needs for the group changes: CATEGORIES
  // values removed, and a UID when it gets its first member line.
  const applyGroupChanges = useCallback(
    (card: Contact): Contact => {
      for (const name of delta.removed) removeCategory(card, name);
      return delta.added.length > 0 ? ensureUid(card) : card;
    },
    [delta],
  );

  // Save — applies the draft to a detached copy: serialise() mutates `raw`
  // in place, so re-parsing keeps the cached contact intact on failure. The
  // card is written only when something on it changed.
  const handleSave = useCallback(async () => {
    const validation = validateDraft(draft);
    setErrors(validation);
    if (!isValid(validation)) return;

    await runSave(draft, async () => {
      const categories = groupsOf(editBase);
      const cardChanges =
        isNew ||
        isDirty(dirty) ||
        delta.removed.some((name) => categories.includes(name)) ||
        (delta.added.length > 0 && editBase.uid.trim() === "");
      if (!cardChanges) return null;
      const detached = applyGroupChanges(
        applyDraft(parse(editBase.raw.toString(), editBase.href, editBase.etag), draft),
      );
      if (onCreate !== undefined) return await onCreate(detached);
      const { etag } = await updateContact.mutateAsync(detached);
      // The card now holds the photo, as the cache does: a later save leaves it.
      return { ...detached, etag, fields: { ...detached.fields, photo: { kind: "unchanged" } } };
    });
  }, [draft, dirty, delta, editBase, isNew, applyGroupChanges, updateContact, runSave, onCreate]);

  // ⌘/Ctrl + Enter saves, from a field too (⌘S belongs to the browser).
  const saveRef = useRef(handleSave);
  const canSaveRef = useRef(false);
  const deferredSave = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    saveRef.current = handleSave;
    canSaveRef.current = edit && !busy;
  });
  useEffect(() => () => clearTimeout(deferredSave.current), []);
  useEffect(() => {
    if (!edit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.repeat || e.isComposing || busy || isDialogOpen()) return;
      e.preventDefault();
      // A field that commits on blur, such as "Ajouter un groupe", commits its
      // value first; the save then runs once the draft holds it.
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        active.dataset.commitOnBlur !== undefined &&
        active.value.trim() !== ""
      ) {
        active.blur();
        deferredSave.current = setTimeout(() => {
          if (canSaveRef.current && !isDialogOpen()) void saveRef.current();
        }, 0);
        return;
      }
      void handleSave();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [edit, busy, handleSave]);

  // Conflict — reload by invalidating the contact query and exiting edit
  const handleConflictReload = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    exitEdit();
  }, [queryClient, exitEdit]);

  // Conflict — overwrite: refetch for a fresh ETag first, apply only the fields
  // the user changed and the group changes, then a conditional PUT. A second
  // 412 surfaces the conflict again.
  const handleConflictOverwrite = useCallback(async () => {
    await runSave(draft, async () => {
      const freshContact = applyGroupChanges(
        applyDraft(await refetchCard(editBase.href), draft, dirty),
      );
      const { etag } = await updateContact.mutateAsync(freshContact);
      return {
        ...freshContact,
        etag,
        fields: { ...freshContact.fields, photo: { kind: "unchanged" } },
      };
    });
  }, [draft, dirty, editBase, refetchCard, applyGroupChanges, updateContact, runSave]);

  // A group card changed elsewhere (ADR 022, as ADR 013): fetch each failed
  // one again and apply only this contact's change to it; a group card that
  // couldn't be created is tried again.
  const handleGroupOverwrite = useCallback(async () => {
    const session = editSession.current;
    setSaveStatus("saving");
    const written: Contact[] = [];
    const remaining: GroupFailure[] = [];
    // Only what the draft still asks for: a chip taken back since is dropped.
    const wanted = groupFailures.filter((f) =>
      (f.kind === "add" ? delta.added : delta.removed).includes(f.name),
    );
    for (const failure of wanted) {
      try {
        if (failure.newCard) {
          // The same card again: a 412 means an earlier try landed, and that
          // card then only needs this contact as member.
          try {
            written.push(await createGroupCard(auth, failure.newCard));
          } catch (err) {
            if (!(err instanceof DavError && err.code === "CONFLICT")) throw err;
            written.push(
              await overwriteGroupChange(auth, failure.cardHref, editBase.uid, failure.kind),
            );
          }
          groupRetries.current.delete(failure.name);
        } else {
          written.push(
            await overwriteGroupChange(auth, failure.cardHref, editBase.uid, failure.kind),
          );
        }
      } catch (error) {
        remaining.push({ ...failure, error });
      }
    }
    cacheGroupCards(written);
    if (session !== editSession.current) return;
    const done = wanted.filter(
      (f) => !remaining.some((r) => r.name === f.name && r.kind === f.kind),
    );
    const base = [
      ...editGroups.filter((name) => !done.some((f) => f.kind === "remove" && f.name === name)),
      ...done.filter((f) => f.kind === "add").map((f) => f.name),
    ];
    setEditGroups(base);
    setGroupFailures(remaining);
    setSaveStatus("idle");
    // Changes made since the failure are still the user's to save.
    if (
      remaining.length === 0 &&
      !isDirty(dirty) &&
      !hasGroupChanges(groupDelta(base, draftGroups))
    ) {
      showToast(t("saved"));
      exitEdit(routeId);
    }
  }, [
    auth,
    groupFailures,
    delta,
    editGroups,
    draftGroups,
    dirty,
    editBase,
    cacheGroupCards,
    showToast,
    t,
    exitEdit,
    routeId,
  ]);

  // Delete — a conditional DELETE with the ETag of the version being edited,
  // so a card changed elsewhere since is never deleted unseen (412).
  const handleDelete = useCallback(async () => {
    const session = editSession.current;
    setShowDelete(false);
    setSaveStatus("deleting");
    setSaveError(null);
    setConflict(false);
    setDeleteConflict(null);
    try {
      await deleteContact.mutateAsync(editBase);
      if (session !== editSession.current) return;
      editSession.current++;
      showToast(t("deleted"));
      router.navigate({ to: "/contacts", replace: true, ignoreBlocker: true });
    } catch (err) {
      if (session !== editSession.current) return;
      setSaveStatus("idle");
      if (err instanceof DavError && err.code === "CONFLICT") setDeleteConflict("delete");
      else setSaveError(t(writeErrorKey(err, "delete")));
    }
  }, [editBase, deleteContact, router, showToast, t]);

  // Move (ADR 021) — the card as the server has it goes to the other book,
  // then leaves this one. After a failure the page stays in edit mode, with
  // the message in the bottom bar.
  const handleMove = useCallback(
    async (target: DavAddressBook) => {
      if (!selectedBook) return;
      const session = editSession.current;
      setSaveStatus("moving");
      setSaveError(null);
      setConflict(false);
      setDeleteConflict(null);
      const sourceKey = contactsKey(auth, selectedBook);
      const targetKey = contactsKey(auth, target);
      const reload = (...keys: (typeof sourceKey)[]) => {
        for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
      };
      const outcome = await moveContact(auth, editBase, target.href);
      if (session !== editSession.current) return;
      setShowMove(false);

      if (outcome.kind === "moved") {
        editSession.current++;
        // The page may stay mounted on the moved card (same UID), so it has
        // to leave this move's state behind.
        setSaveStatus("idle");
        setSaveError(null);
        setConflict(false);
        setDeleteConflict(null);
        setShowDelete(false);
        const moved = parse(outcome.text, outcome.href, outcome.etag);
        queryClient.setQueryData<LoadFullBookResult>(
          sourceKey,
          (old) =>
            old && { ...old, contacts: old.contacts.filter((c) => c.href !== editBase.href) },
        );
        queryClient.setQueryData<LoadFullBookResult>(
          targetKey,
          (old) => old && { ...old, contacts: [...old.contacts, moved] },
        );
        selectBook(target);
        showToast(t("moved_to", { name: bookName(target) }));
        router.navigate({
          to: "/contacts/$id",
          params: { id: contactIdOf(moved) },
          replace: true,
          ignoreBlocker: true,
        });
        return;
      }

      setSaveStatus("idle");
      switch (outcome.kind) {
        case "stale":
          setDeleteConflict("move");
          break;
        case "failed":
          setSaveError(t(writeErrorKey(outcome.error, "move")));
          break;
        case "exists":
          setSaveError(t("err_move_exists"));
          reload(targetKey);
          break;
        case "create_uncertain":
          setSaveError(t("err_move_create_uncertain"));
          reload(sourceKey, targetKey);
          break;
        case "delete_refused":
          if (outcome.error.code === "AUTH") setSaveError(t("err_save_auth"));
          else setDeleteConflict("move");
          break;
        case "in_both":
          setSaveError(t("err_move_in_both"));
          reload(sourceKey, targetKey);
          break;
        case "delete_uncertain":
          setSaveError(t("err_move_delete_uncertain"));
          reload(sourceKey, targetKey);
          break;
      }
    },
    [auth, editBase, selectedBook, selectBook, queryClient, router, showToast, t],
  );

  // Copy handler
  const handleCopy = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        showToast(t("copied"));
      } catch {
        // silent
      }
    },
    [t, showToast],
  );

  const canChangePhoto = canReplacePhoto(editBase);
  const showsPhoto =
    draft.photo.kind === "replaced" ||
    (draft.photo.kind === "unchanged" && photoOf(editBase) !== null);

  // Counts what a save will write back, so in edit mode the version edited.
  const unknownCount = countUnknownProperties((edit ? editBase : contact).raw);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <article
      className="group/fiche"
      data-mode={edit ? "edit" : "view"}
      aria-labelledby="fiche-title"
    >
      {isNew ? (
        <MobileTopBar label={t("new_contact")} />
      ) : (
        <MobileTopBar onEdit={handleToggleEdit} />
      )}
      <div className="mx-auto w-full max-w-[44rem] px-5 pb-28 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14">
        <h1 id="fiche-title" className="sr-only">
          {isNew
            ? t("new_contact")
            : parts.display.length > 0
              ? parts.display
              : org || t("contact_unnamed")}
        </h1>

        {/* Top row: avatar + desktop edit button */}
        <div className="flex items-start justify-between gap-6">
          {isNew ? (
            <PhotoAvatar
              contact={contact}
              edited={draft.photo}
              className="size-24 rounded-xl sm:size-28"
              fallback={<InitialsAvatar family={draft.family} given={draft.given} />}
            />
          ) : (
            <PhotoAvatar
              contact={contact}
              edited={edit ? draft.photo : undefined}
              className="size-24 rounded-xl sm:size-28"
              fallback={
                orgOnly ? (
                  <BuildingAvatar />
                ) : (
                  <InitialsAvatar family={parts.family} given={parts.given} />
                )
              }
            />
          )}
          <div className="hidden lg:block">
            {edit ? (
              <span className="inline-flex h-10 items-center rounded-full px-4 text-sm font-bold text-muted-foreground">
                {isNew ? t("new_contact") : t("edit_label")}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleToggleEdit}
                aria-label={t("edit_kbd")}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("edit")}
              </button>
            )}
          </div>
        </div>

        {/* Name */}
        <div className="-mx-3 mt-5 space-y-1" ref={anchorRef}>
          <EditableCell
            frameClassName={NAME_FRAME}
            view={
              unnamed ? (
                <span className="truncate italic text-muted-foreground">
                  {t("contact_unnamed")}
                </span>
              ) : (
                <span className="truncate">{parts.family}</span>
              )
            }
            edit={
              <div className="relative">
                <input
                  type="text"
                  value={draft.family}
                  placeholder={t("label_family")}
                  onChange={(e) => dispatch({ type: "SET_FAMILY", value: e.target.value })}
                  onBlur={handleBlurValidate}
                  aria-invalid={errors.family !== undefined}
                  aria-describedby={errors.family ? "err-family" : undefined}
                  className={cn(
                    "h-12 w-full rounded-md border bg-card px-3.5 font-display text-[2.25rem] font-bold leading-none tracking-[-0.005em] placeholder:text-leader sm:h-14 sm:text-[2.75rem] sm:placeholder:text-transparent lg:h-15 lg:text-person",
                    errors.family ? "border-destructive" : "border-input",
                  )}
                />
                <span className="absolute right-3 top-1/2 hidden -translate-y-1/2 text-sm font-bold text-muted-foreground pointer-events-none sm:block">
                  {t("label_family")}
                </span>
                {errors.family && (
                  <p id="err-family" className="mt-1 text-sm text-destructive">
                    {t(errors.family as TranslationKey)}
                  </p>
                )}
              </div>
            }
          />
          {edit || parts.given.length > 0 ? (
            <EditableCell
              frameClassName={cn(NAME_FRAME, "text-muted-foreground")}
              view={<span className="truncate">{parts.given}</span>}
              edit={
                <div className="relative">
                  <input
                    type="text"
                    value={draft.given}
                    placeholder={t("label_given")}
                    onChange={(e) => dispatch({ type: "SET_GIVEN", value: e.target.value })}
                    onBlur={handleBlurValidate}
                    aria-invalid={errors.given !== undefined}
                    aria-describedby={errors.given ? "err-given" : undefined}
                    className={cn(
                      "h-12 w-full rounded-md border bg-card px-3.5 font-display text-[2.25rem] font-bold leading-none tracking-[-0.005em] text-muted-foreground placeholder:text-leader sm:h-14 sm:text-[2.75rem] sm:placeholder:text-transparent lg:h-15 lg:text-person",
                      errors.given ? "border-destructive" : "border-input",
                    )}
                  />
                  <span className="absolute right-3 top-1/2 hidden -translate-y-1/2 text-sm font-bold text-muted-foreground pointer-events-none sm:block">
                    {t("label_given")}
                  </span>
                  {errors.given && (
                    <p id="err-given" className="mt-1 text-sm text-destructive">
                      {t(errors.given as TranslationKey)}
                    </p>
                  )}
                </div>
              }
            />
          ) : null}
        </div>

        {/* Job / Org */}
        {(edit || jobTitle.length > 0 || org.length > 0) && (
          <div className="-mx-3.5 mt-1 grid gap-1 sm:grid-cols-2">
            <EditableCell
              frameClassName={cn(TEXT, "text-muted-foreground")}
              view={<span className="truncate">{jobTitle}</span>}
              edit={
                <input
                  type="text"
                  value={draft.title}
                  placeholder={t("label_title")}
                  onChange={(e) => dispatch({ type: "SET_TITLE", value: e.target.value })}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base placeholder:text-muted-foreground lg:text-[0.9375rem]"
                />
              }
            />
            <EditableCell
              frameClassName={cn(TEXT, "text-muted-foreground")}
              view={<span className="truncate">{org}</span>}
              edit={
                <input
                  type="text"
                  value={draft.org}
                  placeholder={t("label_org")}
                  onChange={(e) => dispatch({ type: "SET_ORG", value: e.target.value })}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base placeholder:text-muted-foreground lg:text-[0.9375rem]"
                />
              }
            />
          </div>
        )}

        {/* Action row (view only) */}
        {!edit && (primary || firstEmail) && (
          <div className="mt-5">
            <EditableCell
              unboxed
              view={
                <div className="flex flex-wrap gap-2">
                  {primary && (
                    <a href={`tel:${primary.value}`} className={PRIMARY_PILL}>
                      <PhoneIcon />
                      {t("call")}
                    </a>
                  )}
                  {primary && (
                    <a href={`sms:${primary.value}`} className={OUTLINE_PILL}>
                      {t("sms")}
                    </a>
                  )}
                  {firstEmail && (
                    <a href={`mailto:${firstEmail.value}`} className={OUTLINE_PILL}>
                      <MailIcon />
                      {t("write")}
                    </a>
                  )}
                </div>
              }
            />
          </div>
        )}

        {/* Action row (edit only): the photo */}
        {edit && (canChangePhoto || showsPhoto) && (
          <div className="mt-5 flex flex-wrap gap-2">
            {canChangePhoto && (
              <>
                <button
                  ref={changePhotoRef}
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className={OUTLINE_PILL}
                >
                  {t("photo_change")}
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    // Choosing the same file again should reopen the dialog.
                    event.target.value = "";
                    if (file) void handlePhotoFile(file);
                  }}
                />
              </>
            )}
            {showsPhoto && (
              <button
                type="button"
                onClick={() => dispatch({ type: "SET_PHOTO", value: { kind: "removed" } })}
                className={OUTLINE_PILL}
              >
                {t("photo_remove")}
              </button>
            )}
          </div>
        )}

        {/* Sections */}
        <div className="mt-8 space-y-7">
          {/* Phones - view */}
          {!edit && contact.fields.tel.length > 0 && (
            <Section
              title={t("s_phones")}
              edit={edit}
              sectionId="sec-tel"
              onPencilClick={() => enterEditFocused("sec-tel")}
            >
              {contact.fields.tel.map((field, _i) => (
                <ValueRow
                  key={fieldRowKey(field)}
                  type={<TypeCell field={field} />}
                  value={
                    <EditableCell
                      frameClassName={cn(field === primary ? "text-xl font-bold tabular" : TEXT)}
                      view={
                        <a
                          href={`tel:${field.value}`}
                          className="block min-w-0 truncate hover:underline"
                        >
                          {formatPhone(field.value)}
                        </a>
                      }
                    />
                  }
                  action={
                    <CopyButton label={t("copy_tel")} onCopy={() => handleCopy(field.value)} />
                  }
                />
              ))}
            </Section>
          )}
          {/* Phones - edit */}
          {edit && (
            <Section
              title={t("s_phones")}
              edit={edit}
              addLabel={t("add_phone")}
              onAddClick={() => dispatch({ type: "ADD_TEL" })}
            >
              {draft.tel.map((field, i) => (
                <ValueRow
                  key={field.id}
                  type={
                    <TypeSelect
                      aria-label={t("label_tel_type")}
                      value={draft.tel[i]?.type ?? ""}
                      onChange={(v) => dispatch({ type: "SET_TEL_TYPE", index: i, value: v })}
                    />
                  }
                  value={
                    <EditableCell
                      frameClassName={cn(
                        TEXT,
                        field === draftPrimary ? "text-xl font-bold tabular" : TEXT,
                      )}
                      view={
                        <a
                          href={`tel:${field.value}`}
                          className="block min-w-0 truncate hover:underline"
                        >
                          {formatPhone(field.value)}
                        </a>
                      }
                      edit={
                        <input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          aria-label={`${t("label_tel")} (${t(typeLabelKey(draft.tel[i]?.type ?? ""))})`}
                          value={draft.tel[i]?.value ?? ""}
                          onChange={(e) =>
                            dispatch({ type: "SET_TEL", index: i, value: e.target.value })
                          }
                          className={cn(
                            "h-11 w-full rounded-md border border-input bg-card px-3.5 tabular",
                            field === draftPrimary
                              ? "text-xl font-bold"
                              : "text-base lg:text-[0.9375rem]",
                          )}
                        />
                      }
                    />
                  }
                  action={
                    <RemoveButton
                      aria-label={t("remove_tel")}
                      onClick={() => dispatch({ type: "REMOVE_TEL", index: i })}
                    />
                  }
                />
              ))}
            </Section>
          )}

          {/* Emails - view */}
          {!edit && contact.fields.email.length > 0 && (
            <Section
              title={t("s_emails")}
              sectionId="sec-email"
              onPencilClick={() => enterEditFocused("sec-email")}
            >
              {contact.fields.email.map((field) => (
                <ValueRow
                  key={fieldRowKey(field)}
                  type={<TypeCell field={field} />}
                  value={
                    <EditableCell
                      frameClassName={TEXT}
                      view={
                        <a
                          href={`mailto:${field.value}`}
                          className="block min-w-0 truncate hover:underline"
                        >
                          {field.value}
                        </a>
                      }
                    />
                  }
                  action={
                    <CopyButton label={t("copy_email")} onCopy={() => handleCopy(field.value)} />
                  }
                />
              ))}
            </Section>
          )}
          {/* Emails - edit */}
          {edit && (
            <Section
              title={t("s_emails")}
              edit={edit}
              addLabel={t("add_email")}
              onAddClick={() => dispatch({ type: "ADD_EMAIL" })}
            >
              {draft.email.map((field, i) => (
                <ValueRow
                  key={field.id}
                  type={
                    <TypeSelect
                      aria-label={t("label_email_type")}
                      value={draft.email[i]?.type ?? ""}
                      onChange={(v) => dispatch({ type: "SET_EMAIL_TYPE", index: i, value: v })}
                    />
                  }
                  value={
                    <EditableCell
                      frameClassName={TEXT}
                      view={
                        <a
                          href={`mailto:${field.value}`}
                          className="block min-w-0 truncate hover:underline"
                        >
                          {field.value}
                        </a>
                      }
                      edit={
                        <>
                          <input
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            aria-label={`${t("label_email")} (${t(typeLabelKey(draft.email[i]?.type ?? ""))})`}
                            value={draft.email[i]?.value ?? ""}
                            onChange={(e) =>
                              dispatch({ type: "SET_EMAIL", index: i, value: e.target.value })
                            }
                            onBlur={handleBlurValidate}
                            aria-invalid={errors[`email_${i}`] !== undefined}
                            aria-describedby={errors[`email_${i}`] ? `err-email-${i}` : undefined}
                            className={cn(
                              "h-11 w-full rounded-md border bg-card px-3.5 text-base lg:text-[0.9375rem]",
                              errors[`email_${i}`] ? "border-destructive" : "border-input",
                            )}
                          />
                          {errors[`email_${i}`] && (
                            <p id={`err-email-${i}`} className="mt-1 text-sm text-destructive">
                              {t(errors[`email_${i}`] as TranslationKey)}
                            </p>
                          )}
                        </>
                      }
                    />
                  }
                  action={
                    <RemoveButton
                      aria-label={t("remove_email")}
                      onClick={() => dispatch({ type: "REMOVE_EMAIL", index: i })}
                    />
                  }
                />
              ))}
            </Section>
          )}

          {/* Address */}
          {((edit && draft.adr !== null) || (!edit && address !== null && addressHasContent)) && (
            <Section
              title={t("s_address")}
              edit={edit}
              sectionId="sec-adr"
              onPencilClick={edit ? undefined : () => enterEditFocused("sec-adr")}
            >
              <ValueRow
                type={
                  address !== null ? (
                    edit && draft.adr ? (
                      <TypeSelect
                        aria-label={t("label_adr_type")}
                        value={(draft.adr.type[0] ?? "").toLowerCase()}
                        onChange={(v) => dispatch({ type: "SET_ADR_TYPE", value: v })}
                      />
                    ) : (
                      <AddressTypeCell address={address} />
                    )
                  ) : null
                }
                value={
                  edit && draft.adr ? (
                    <EditAddressValue adr={draft.adr} dispatch={dispatch} />
                  ) : address !== null ? (
                    <AddressValue address={address} />
                  ) : null
                }
                action={
                  address !== null && !edit ? (
                    <CopyButton
                      label={t("copy_adr")}
                      onCopy={() => handleCopy(addressCopyText(address))}
                    />
                  ) : null
                }
              />
            </Section>
          )}

          {/* Birthday */}
          {((edit && draft.bday !== null) ||
            (!edit && birthday !== null && birthday.source.length > 0)) && (
            <Section
              title={t("s_bday")}
              edit={edit}
              sectionId="sec-bday"
              onPencilClick={edit ? undefined : () => enterEditFocused("sec-bday")}
            >
              <ValueRow
                value={
                  edit && draft.bday ? (
                    <div className="flex flex-wrap gap-2">
                      <div>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={t("placeholder_bday_day")}
                          value={draft.bday.day}
                          onChange={(e) =>
                            dispatch({ type: "SET_BDAY_DAY", value: e.target.value })
                          }
                          onBlur={handleBlurValidate}
                          aria-invalid={errors.bday_day !== undefined}
                          aria-describedby={errors.bday_day ? "err-bday-day" : undefined}
                          className={cn(
                            "h-11 w-16 rounded-md border bg-card px-3 text-center text-base lg:text-[0.9375rem]",
                            errors.bday_day ? "border-destructive" : "border-input",
                          )}
                        />
                        {errors.bday_day && (
                          <p id="err-bday-day" className="mt-1 text-sm text-destructive">
                            {t(errors.bday_day as TranslationKey)}
                          </p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={t("placeholder_bday_month")}
                          value={draft.bday.month}
                          onChange={(e) =>
                            dispatch({ type: "SET_BDAY_MONTH", value: e.target.value })
                          }
                          onBlur={handleBlurValidate}
                          aria-invalid={errors.bday_month !== undefined}
                          aria-describedby={errors.bday_month ? "err-bday-month" : undefined}
                          className={cn(
                            "h-11 w-16 rounded-md border bg-card px-3 text-center text-base lg:text-[0.9375rem]",
                            errors.bday_month ? "border-destructive" : "border-input",
                          )}
                        />
                        {errors.bday_month && (
                          <p id="err-bday-month" className="mt-1 text-sm text-destructive">
                            {t(errors.bday_month as TranslationKey)}
                          </p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={t("placeholder_bday_year")}
                          value={draft.bday.year}
                          onChange={(e) =>
                            dispatch({ type: "SET_BDAY_YEAR", value: e.target.value })
                          }
                          onBlur={handleBlurValidate}
                          aria-invalid={errors.bday_year !== undefined}
                          aria-describedby={errors.bday_year ? "err-bday-year" : undefined}
                          className={cn(
                            "h-11 w-24 rounded-md border bg-card px-3 text-center text-base lg:text-[0.9375rem]",
                            errors.bday_year ? "border-destructive" : "border-input",
                          )}
                        />
                        {errors.bday_year && (
                          <p id="err-bday-year" className="mt-1 text-sm text-destructive">
                            {t(errors.bday_year as TranslationKey)}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : birthday !== null ? (
                    <EditableCell
                      frameClassName={TEXT}
                      view={
                        <time dateTime={birthdayDateTime(birthday)}>
                          {formatBirthday(birthday, locale)}
                        </time>
                      }
                    />
                  ) : null
                }
                action={
                  !edit && birthday !== null ? (
                    <CopyButton label={t("copy_bday")} onCopy={() => handleCopy(birthday.source)} />
                  ) : null
                }
              />
            </Section>
          )}

          {/* Groups */}
          {edit && !isNew ? (
            <Section title={t("s_groups")}>
              <GroupsEditor
                names={draftGroups}
                suggestions={groupSuggestions}
                onChange={setDraftGroups}
              />
            </Section>
          ) : (
            groups.length > 0 && (
              <Section title={t("s_groups")}>
                <div className="px-3.5 py-1.5">
                  <ul className="flex min-h-8 flex-wrap items-center gap-2">
                    {groups.map((group) => (
                      <li
                        key={group}
                        className="inline-flex h-8 items-center rounded-full bg-background px-3 text-sm font-bold"
                      >
                        {group}
                      </li>
                    ))}
                  </ul>
                </div>
              </Section>
            )
          )}

          {/* URL section */}
          {(edit || contact.fields.url.length > 0) && (
            <Section
              title={t("s_urls")}
              edit={edit}
              sectionId="sec-url"
              onPencilClick={edit ? undefined : () => enterEditFocused("sec-url")}
            >
              {edit ? (
                <ValueRow
                  value={
                    <EditableCell
                      frameClassName={TEXT}
                      view={<span />}
                      edit={
                        <>
                          <input
                            type="url"
                            inputMode="url"
                            autoComplete="url"
                            aria-label={t("label_url")}
                            value={draft.url}
                            onChange={(e) => dispatch({ type: "SET_URL", value: e.target.value })}
                            onBlur={handleBlurValidate}
                            aria-invalid={errors.url !== undefined}
                            aria-describedby={errors.url ? "err-url" : undefined}
                            className={cn(
                              "h-11 w-full rounded-md border bg-card px-3.5 text-base lg:text-[0.9375rem]",
                              errors.url ? "border-destructive" : "border-input",
                            )}
                          />
                          {errors.url && (
                            <p id="err-url" className="mt-1 text-sm text-destructive">
                              {t(errors.url as TranslationKey)}
                            </p>
                          )}
                        </>
                      }
                    />
                  }
                />
              ) : contact.fields.url.length > 0 ? (
                <ValueRow
                  value={
                    <EditableCell
                      frameClassName={TEXT}
                      view={
                        // Another scheme could open a local application.
                        isWebUrl(contact.fields.url) ? (
                          <a
                            href={contact.fields.url}
                            className="block min-w-0 truncate hover:underline"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {contact.fields.url}
                          </a>
                        ) : (
                          <span className="block min-w-0 truncate">{contact.fields.url}</span>
                        )
                      }
                    />
                  }
                />
              ) : null}
            </Section>
          )}

          {/* Nickname section */}
          {(edit || contact.fields.nickname.length > 0) && (
            <Section
              title={t("s_nickname")}
              edit={edit}
              sectionId="sec-nickname"
              onPencilClick={edit ? undefined : () => enterEditFocused("sec-nickname")}
            >
              {edit ? (
                <ValueRow
                  value={
                    <EditableCell
                      frameClassName={TEXT}
                      view={<span />}
                      edit={
                        <input
                          type="text"
                          aria-label={t("s_nickname")}
                          value={draft.nickname}
                          onChange={(e) =>
                            dispatch({ type: "SET_NICKNAME", value: e.target.value })
                          }
                          className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base lg:text-[0.9375rem]"
                        />
                      }
                    />
                  }
                />
              ) : (
                <ValueRow
                  value={
                    <EditableCell
                      frameClassName={TEXT}
                      view={<span>{contact.fields.nickname}</span>}
                    />
                  }
                />
              )}
            </Section>
          )}

          {/* Note */}
          {(edit || note.length > 0) && (
            <Section
              title={t("s_note")}
              edit={edit}
              sectionId="sec-note"
              onPencilClick={edit ? undefined : () => enterEditFocused("sec-note")}
            >
              <EditableCell
                frameClassName={cn(
                  "h-auto min-h-[6rem] items-start py-2.5 text-base leading-relaxed whitespace-pre-wrap lg:text-[0.9375rem]",
                )}
                view={<span>{note}</span>}
                edit={
                  <textarea
                    aria-label={t("s_note")}
                    value={draft.note}
                    onChange={(e) => dispatch({ type: "SET_NOTE", value: e.target.value })}
                    className="h-auto min-h-[6rem] w-full rounded-md border border-input bg-card px-3.5 py-2.5 text-base leading-relaxed lg:text-[0.9375rem] resize-y"
                  />
                }
              />
            </Section>
          )}
        </div>

        {/* Below content — edit only */}
        {edit && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              {draft.adr === null && (
                <AddPill label={t("add_address")} onClick={() => dispatch({ type: "ADD_ADR" })} />
              )}
              {draft.bday === null && (
                <AddPill label={t("add_bday")} onClick={() => dispatch({ type: "ADD_BDAY" })} />
              )}
            </div>
            {unknownCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {unknownCount === 1
                  ? t("preserved_fields_1")
                  : t("preserved_fields", { n: String(unknownCount) })}
              </p>
            )}
            {!isNew && otherBooks.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowMove(true)}
                  disabled={busy || hasChanges}
                  aria-describedby={hasChanges ? moveHintId : undefined}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-input bg-background px-4 text-sm font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  <MoveIcon />
                  {t("move_contact")}
                </button>
                {hasChanges && (
                  <p id={moveHintId} className="mt-1.5 text-caption text-muted-foreground">
                    {t("move_disabled_hint")}
                  </p>
                )}
              </div>
            )}
            {!isNew && (
              <button
                type="button"
                onClick={() => setShowDelete(true)}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:bg-destructive/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <TrashIcon />
                {t("delete_contact")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sticky bottom bar — edit only */}
      {edit && (
        <div className="sticky bottom-0 z-30 border-t bg-background px-4 py-3 shadow-float">
          {conflict && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-bold text-destructive">{t("conflict_title")}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleConflictReload}
                  className="inline-flex h-9 items-center rounded-full bg-primary px-3 text-sm font-bold text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("conflict_reload")}
                </button>
                <button
                  type="button"
                  onClick={handleConflictOverwrite}
                  className="inline-flex h-9 items-center rounded-full border border-input bg-background px-3 text-sm font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("conflict_overwrite")}
                </button>
              </div>
            </div>
          )}

          {deleteConflict && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3"
            >
              <p className="text-sm font-bold text-destructive">{t("conflict_title")}</p>
              <p className="mt-1 text-sm text-destructive">
                {t(deleteConflict === "move" ? "conflict_move_hint" : "conflict_delete_hint")}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleConflictReload}
                  className="inline-flex h-9 items-center rounded-full bg-primary px-3 text-sm font-bold text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {t("conflict_reload")}
                </button>
              </div>
            </div>
          )}

          {groupFailures.length > 0 && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3"
            >
              <p className="text-sm font-bold text-destructive">{t("groups_not_saved")}</p>
              <ul className="mt-1 text-sm text-destructive">
                {groupFailures
                  .filter(
                    (f, i, all) =>
                      all.findIndex((g) => g.name === f.name && g.kind === f.kind) === i,
                  )
                  .map((failure) => (
                    <li key={`${failure.kind}-${failure.name}`}>
                      {failure.name} · {t(groupErrorKey(failure.error))}
                    </li>
                  ))}
              </ul>
              {groupFailures.some(
                (f) => f.error instanceof DavError && f.error.code === "CONFLICT",
              ) && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleConflictReload}
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-full bg-primary px-3 text-sm font-bold text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    {t("conflict_reload")}
                  </button>
                  <button
                    type="button"
                    onClick={handleGroupOverwrite}
                    disabled={busy}
                    className="inline-flex h-9 items-center rounded-full border border-input bg-background px-3 text-sm font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    {t("conflict_overwrite")}
                  </button>
                </div>
              )}
            </div>
          )}

          {saveError !== null && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2"
            >
              <p className="text-sm text-destructive">{saveError}</p>
            </div>
          )}

          <div className="mx-auto flex max-w-[44rem] items-center gap-3">
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleCancel}
              disabled={deleting}
              className="inline-flex h-10 items-center rounded-full border border-input bg-background px-4 text-sm font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {saveStatus === "saving" ? (
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
      )}

      {chosenPhoto && (
        <PhotoCropDialog
          chosen={chosenPhoto}
          returnFocusTo={changePhotoRef}
          onCancel={() => setChosenPhoto(null)}
          onUse={(photo) => {
            dispatch({ type: "SET_PHOTO", value: { kind: "replaced", ...photo } });
            setChosenPhoto(null);
          }}
        />
      )}

      {showDelete && (
        <ConfirmDialog
          title={t("delete_title")}
          continueLabel={t("cancel")}
          confirmLabel={t("delete_confirm")}
          confirmIcon={<TrashIcon />}
          onContinue={() => setShowDelete(false)}
          onConfirm={handleDelete}
        />
      )}

      {showMove && (
        <MoveDialog
          books={otherBooks}
          running={saveStatus === "moving"}
          spinner={<SpinnerIcon />}
          onCancel={() => setShowMove(false)}
          onMove={handleMove}
        />
      )}

      {showDiscard && (
        <ConfirmDialog
          title={t("discard_title")}
          continueLabel={t("discard_continue")}
          confirmLabel={t("discard_abandon")}
          onContinue={closeDiscard}
          onConfirm={() => {
            setShowDiscard(false);
            if (blockerActive) {
              blocker?.proceed?.();
            } else {
              exitEdit();
            }
          }}
        />
      )}
    </article>
  );
}

/** Why a group change was not written, for the bottom bar. */
function groupErrorKey(err: unknown): TranslationKey {
  if (err instanceof DavError && err.code === "CONFLICT") return "group_err_conflict";
  if (err instanceof DavError && err.code === "NETWORK") return "group_err_network";
  if (err instanceof DavError && err.code === "AUTH") return "group_err_auth";
  return "group_err_refused";
}

/** Message for a failed PUT or DELETE other than a 412, which each caller handles. */
const NETWORK_ERROR_KEYS: Record<"save" | "delete" | "move", TranslationKey> = {
  save: "err_save_network",
  delete: "err_delete_network",
  move: "err_move_network",
};

function writeErrorKey(err: unknown, write: "save" | "delete" | "move"): TranslationKey {
  if (err instanceof DavError && err.code === "NETWORK") {
    return NETWORK_ERROR_KEYS[write];
  }
  if (err instanceof DavError && err.code === "AUTH") return "err_save_auth";
  if (err instanceof DavError && err.code === "TOO_LARGE") return "err_save_too_large";
  return write === "move" ? "err_move_unexpected" : "err_save_unexpected";
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

/**
 * Modal confirming a destructive action (dropping edits, deleting the
 * contact). Focus starts on the safe action and Tab cycles between the two
 * buttons; Esc is handled by the page, which owns the window key listener.
 */
function ConfirmDialog({
  title,
  continueLabel,
  confirmLabel,
  confirmIcon,
  onContinue,
  onConfirm,
}: {
  title: string;
  continueLabel: string;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  onContinue: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const continueRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    continueRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  const trapTab = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab") return;
    const first = continueRef.current;
    const last = confirmRef.current;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onContinue();
      }}
      onKeyDown={trapTab}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center dark:bg-black/60"
    >
      <div
        role="document"
        className="w-full max-w-md rounded-t-xl bg-background p-6 shadow-overlay sm:rounded-xl"
      >
        <h2 id={titleId} className="font-display text-2xl font-bold leading-tight">
          {title}
        </h2>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            className="inline-flex h-10 items-center justify-center rounded-full border border-input bg-background px-4 text-sm font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {continueLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:bg-destructive/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {confirmIcon}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections and rows
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
  edit,
  sectionId,
  onPencilClick,
  onAddClick,
  addLabel,
}: {
  title: string;
  children: ReactNode;
  edit?: boolean;
  sectionId?: string;
  onPencilClick?: () => void;
  onAddClick?: () => void;
  addLabel?: string;
}) {
  return (
    <section
      id={sectionId}
      className="border-t-2 border-foreground pt-1.5 dark:border-foreground/60"
    >
      <h2 className="flex h-11 items-center justify-between text-sm font-bold">
        <span>{title}</span>
        <span className="flex items-center gap-1">
          {edit === false && onPencilClick && (
            <button
              type="button"
              aria-label={title}
              onClick={onPencilClick}
              className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @media(hover:hover):opacity-0 group-hover:opacity-100"
            >
              <PencilIcon />
            </button>
          )}
          {edit && onAddClick && addLabel && (
            <button
              type="button"
              onClick={onAddClick}
              className="inline-flex h-8 items-center rounded-full px-3 text-sm font-bold text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {addLabel}
            </button>
          )}
        </span>
      </h2>
      <div className="-mx-3.5 space-y-3 sm:space-y-1">{children}</div>
    </section>
  );
}

function PencilIcon() {
  return (
    <svg
      className="size-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function fieldRowKey(field: ContactField): string {
  return `${field.value}\u0000${field.params ? JSON.stringify(field.params) : ""}`;
}

function ValueRow({
  type,
  value,
  action,
}: {
  type?: ReactNode;
  value: ReactNode;
  action?: ReactNode;
}) {
  if (type === undefined) {
    return (
      <div className="grid grid-cols-[1fr_auto] gap-x-2">
        <div className="min-w-0">{value}</div>
        {action !== undefined && <div>{action}</div>}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-2 sm:grid-cols-[8.5rem_1fr_auto]">
      <div className="col-start-1 row-start-1">{type}</div>
      {action !== undefined && (
        <div className="col-start-2 row-start-1 sm:col-start-3">{action}</div>
      )}
      <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type cell / select
// ---------------------------------------------------------------------------

function TypeCell({ field }: { field: ContactField }) {
  return <TypeLabel types={typeValuesOf(field)} />;
}

function AddressTypeCell({ address }: { address: VCardAddress }) {
  return <TypeLabel types={address.type.map((t) => t.toLowerCase())} />;
}

function TypeLabel({ types }: { types: string[] }) {
  const { t } = useI18n();
  const key: TranslationKey = types.includes("cell")
    ? "t_cell"
    : types.includes("work")
      ? "t_work"
      : types.includes("home")
        ? "t_home"
        : "t_other";
  return (
    <EditableCell
      frameClassName="h-9 text-sm font-bold text-muted-foreground sm:h-11"
      view={<span>{t(key)}</span>}
    />
  );
}

const TYPE_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: "cell", labelKey: "t_cell" },
  { value: "work", labelKey: "t_work" },
  { value: "home", labelKey: "t_home" },
  { value: "", labelKey: "t_other" },
];

/** The option label of a type, which also tells same-named rows apart. */
function typeLabelKey(type: string): TranslationKey {
  return TYPE_OPTIONS.find((opt) => opt.value === type)?.labelKey ?? "t_other";
}

function TypeSelect({
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  "aria-label": string;
}) {
  const { t } = useI18n();
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm font-bold text-muted-foreground sm:h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {TYPE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {t(opt.labelKey)}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Address value / edit
// ---------------------------------------------------------------------------

function AddressValue({ address }: { address: VCardAddress }) {
  return (
    <div className="space-y-1">
      {address.street.length > 0 && (
        <EditableCell
          frameClassName={TEXT}
          view={<span className="truncate">{address.street}</span>}
        />
      )}
      {(address.postalCode.length > 0 || address.locality.length > 0) && (
        <div className="grid grid-cols-[5.5rem_1fr] gap-1">
          {address.postalCode.length > 0 && (
            <EditableCell
              frameClassName={TEXT}
              view={<span className="truncate">{address.postalCode}</span>}
            />
          )}
          {address.locality.length > 0 && (
            <EditableCell
              frameClassName={TEXT}
              view={<span className="truncate">{address.locality}</span>}
            />
          )}
        </div>
      )}
      {address.country.length > 0 && (
        <EditableCell
          frameClassName={cn(TEXT, "text-muted-foreground")}
          view={<span className="truncate">{address.country}</span>}
        />
      )}
    </div>
  );
}

function EditAddressValue({
  adr,
  dispatch,
}: {
  adr: NonNullable<ContactDraft["adr"]>;
  dispatch: React.Dispatch<DraftAction>;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1">
      <input
        type="text"
        aria-label={t("label_street")}
        value={adr.street}
        onChange={(e) => dispatch({ type: "SET_ADR_STREET", value: e.target.value })}
        className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base lg:text-[0.9375rem]"
      />
      <div className="grid grid-cols-[5.5rem_1fr] gap-1">
        <input
          type="text"
          inputMode="numeric"
          aria-label={t("label_postal_code")}
          value={adr.postalCode}
          onChange={(e) => dispatch({ type: "SET_ADR_POSTAL_CODE", value: e.target.value })}
          className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base lg:text-[0.9375rem]"
        />
        <input
          type="text"
          aria-label={t("label_locality")}
          value={adr.locality}
          onChange={(e) => dispatch({ type: "SET_ADR_LOCALITY", value: e.target.value })}
          className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base lg:text-[0.9375rem]"
        />
      </div>
      <input
        type="text"
        aria-label={t("label_country")}
        value={adr.country}
        onChange={(e) => dispatch({ type: "SET_ADR_COUNTRY", value: e.target.value })}
        className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base text-muted-foreground lg:text-[0.9375rem]"
      />
    </div>
  );
}

function addressCopyText(address: VCardAddress): string {
  const lines = [
    address.street,
    [address.postalCode, address.locality].filter((part) => part.length > 0).join(" "),
    address.country,
  ].filter((part) => part.length > 0);
  return lines.join(", ");
}

// ---------------------------------------------------------------------------
// Action buttons
// ---------------------------------------------------------------------------

function CopyButton({ label, onCopy }: { label: string; onCopy: () => void }) {
  return (
    <EditableCell
      unboxed
      cellClassName="justify-items-end"
      view={
        <button
          type="button"
          aria-label={label}
          onClick={onCopy}
          className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground sm:size-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted"
        >
          <CopyIcon />
        </button>
      }
    />
  );
}

/**
 * Groups in edit mode (DESIGN.md): the chips gain a ×, and an "Ajouter un
 * groupe" input ends the line, suggesting the book's other group names.
 */
function GroupsEditor({
  names,
  suggestions,
  onChange,
}: {
  names: string[];
  suggestions: string[];
  onChange: (names: string[]) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function add() {
    const name = value.trim();
    if (name.length > 0 && !names.includes(name)) onChange([...names, name]);
    setValue("");
  }

  return (
    <div className="px-3.5 py-1.5">
      <ul className="flex min-h-8 flex-wrap items-center gap-2">
        {names.map((name) => (
          <li
            key={name}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-background pl-3 pr-1 text-sm font-bold"
          >
            {name}
            <button
              type="button"
              aria-label={t("remove_group", { name })}
              onClick={() => {
                onChange(names.filter((other) => other !== name));
                // The chip and its button go: the focus moves to the input.
                inputRef.current?.focus();
              }}
              className="relative inline-flex size-6 items-center justify-center rounded-full text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <XSmallIcon />
            </button>
          </li>
        ))}
        <li>
          <input
            ref={inputRef}
            type="text"
            value={value}
            list={listId}
            aria-label={t("add_group")}
            placeholder={t("add_group")}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              // ⌘/Ctrl + Enter is the save shortcut, which commits the name itself.
              if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                add();
              }
            }}
            onBlur={add}
            data-commit-on-blur
            className="h-8 w-44 rounded-full border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          />
          <datalist id={listId}>
            {suggestions
              .filter((name) => !names.includes(name))
              .map((name) => (
                <option key={name} value={name} />
              ))}
          </datalist>
        </li>
      </ul>
    </div>
  );
}

function XSmallIcon() {
  return (
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function RemoveButton({
  "aria-label": ariaLabel,
  onClick,
}: {
  "aria-label": string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-destructive sm:size-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <TrashIcon />
    </button>
  );
}

function AddPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center rounded-full border border-dashed border-input bg-background px-3 text-sm font-bold text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Avatars and icons
// ---------------------------------------------------------------------------

function InitialsAvatar({ family, given }: { family: string; given: string }) {
  const letters = `${family.charAt(0)}${given.charAt(0)}`.toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="grid size-24 shrink-0 place-items-center rounded-xl bg-avatar font-display text-5xl font-bold text-avatar-foreground sm:size-28"
    >
      {letters}
    </span>
  );
}

function BuildingAvatar() {
  return (
    <span
      aria-hidden="true"
      className="grid size-24 shrink-0 place-items-center rounded-xl bg-avatar text-avatar-foreground sm:size-28"
    >
      <svg
        className="size-12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
      </svg>
    </span>
  );
}

function PhoneIcon() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      className="size-[1.125rem] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg
      className="size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="size-[1.125rem] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx={12} cy={12} r={10} stroke="currentColor" strokeWidth={4} />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Pill recipes
// ---------------------------------------------------------------------------

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const PRIMARY_PILL = cn(
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/85",
  FOCUS_RING,
);

const OUTLINE_PILL = cn(
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-input bg-background px-4 text-sm font-bold transition-colors hover:bg-accent",
  FOCUS_RING,
);
