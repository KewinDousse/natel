/**
 * ContactPage — the contact page (DESIGN.md "Contact page"): the reading
 * view, or the edit form with its bottom bar and dialogs. `?edit` in the URL
 * reflects and drives the mode. NewContactPage is the form on a blank card.
 * The page owns the draft, the saves and their outcomes; ContactView and
 * ContactEditor only render.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import {
  applyDraft,
  buildDraft,
  type ContactDraft,
  dirtyDiff,
  isDirty,
  isValid,
  rebaseDraft,
  type ValidationErrors,
  validateDraft,
} from "@/lib/contact-edit";
import { bookGroupNames, contactGroupNames } from "@/lib/contact-groups";
import { contactById, contactIdOf, namePartsOf } from "@/lib/contact-list";
import { draftReducer } from "@/lib/draft-reducer";
import { bookName } from "@/lib/vcf-file";
import type { Contact } from "@/model/contact";
import {
  type DavAddressBook,
  type DavAuth,
  DavError,
  type GroupFailure,
  groupDelta,
  hasGroupChanges,
  type LoadFullBookResult,
  moveContact,
  retryGroupFailures,
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
  canReplacePhoto,
  ensureUid,
  groupsOf,
  newContact,
  orgOf,
  parse,
  photoOf,
  removeCategory,
  unshownPropertiesOf,
} from "@/vcard";
import { ConfirmDialog, UnshownPropertiesDialog } from "./contact-dialogs";
import { ContactEditBar } from "./contact-edit-bar";
import { ContactEditor } from "./contact-editor";
import { ContactView } from "./contact-view";
import { SpinnerIcon, TrashIcon } from "./icons";
import { MobileTopBar } from "./mobile-top-bar";
import { MoveDialog } from "./move-dialog";
import { PhotoCropDialog } from "./photo-crop-dialog";
import { useToast } from "./toast";
import { useEditShortcuts } from "./use-edit-shortcuts";
import { usePhotoChoice } from "./use-photo-choice";
import { writeErrorText } from "./write-error";

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

/** The element that scrolls `element`: the detail pane from lg, the page below. */
function scrollParentOf(element: HTMLElement): HTMLElement | Window {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return window;
}

// ---------------------------------------------------------------------------
// The page
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

  // The page's name: the card's own (FN), else built from its parts.
  const parts = useMemo(() => namePartsOf(contact), [contact]);
  const org = useMemo(() => orgOf(contact), [contact]);
  const pageName = isNew
    ? t("new_contact")
    : contact.fields.fn.trim() || parts.display || org || t("contact_unnamed");
  const groups = useMemo(() => contactGroupNames(contact, groupCards), [contact, groupCards]);

  useEffect(() => {
    document.title = isNew
      ? t("new_contact_doc_title")
      : t("contact_doc_title", { name: pageName });
  }, [isNew, pageName, t]);

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
  const [errors, setErrors] = useState<ValidationErrors>({});
  // Fields the last save attempt found to correct, for the bottom bar.
  const [invalidCount, setInvalidCount] = useState(0);
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
  const [showUnshown, setShowUnshown] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const changePhotoRef = useRef<HTMLButtonElement>(null);

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

  const [chosenPhoto, setChosenPhoto, handlePhotoFile] = usePhotoChoice(editSession);

  // `savedId` is the contact to land on after a save; without it, a new
  // contact has nothing to show and goes back to the list.
  const exitEdit = useCallback(
    (savedId?: string) => {
      editSession.current++;
      dispatch({ type: "REBUILD", draft: buildDraft(contact) });
      setDraftGroups(groups);
      setGroupFailures([]);
      setErrors({});
      setInvalidCount(0);
      setConflict(false);
      setDeleteConflict(null);
      setShowDelete(false);
      setShowMove(false);
      setShowUnshown(false);
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
    [contact, groups, router, routeId, isNew, setChosenPhoto],
  );

  // Enter edit mode, keeping `anchor` (a section, or the top of the page) where
  // it is on the screen, and on a section the focus goes to its first field.
  const enterEdit = useCallback(
    (sectionId?: string) => {
      if (edit) return;
      const anchor = document.getElementById(sectionId ?? "fiche-top");
      const top = anchor?.getBoundingClientRect().top;
      router.navigate({
        to: "/contacts/$id",
        params: { id: routeId },
        search: { edit: true },
        replace: true,
      });
      requestAnimationFrame(() => {
        const moved = document.getElementById(sectionId ?? "fiche-top");
        if (moved && top !== undefined) {
          scrollParentOf(moved).scrollBy(0, moved.getBoundingClientRect().top - top);
        }
        if (sectionId) {
          moved?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
        }
      });
    },
    [edit, router, routeId],
  );

  const handleToggleEdit = useCallback(() => {
    if (edit) exitEdit();
    else enterEdit();
  }, [edit, exitEdit, enterEdit]);

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
  }, [blockerActive, setChosenPhoto]);

  const closeDiscard = useCallback(() => {
    setShowDiscard(false);
    if (blockerActive) blocker?.reset?.();
  }, [blockerActive, blocker]);

  // Esc closes the open dialog (photo, delete, move or discard), otherwise it
  // cancels editing.
  const handleEscape = useCallback(() => {
    if (chosenPhoto !== null) {
      setChosenPhoto(null);
    } else if (showUnshown) {
      setShowUnshown(false);
    } else if (showDelete) {
      setShowDelete(false);
    } else if (showMove) {
      setShowMove(false);
    } else if (showDiscard) {
      closeDiscard();
    } else {
      handleCancel();
    }
  }, [
    chosenPhoto,
    setChosenPhoto,
    showUnshown,
    showDelete,
    showMove,
    showDiscard,
    closeDiscard,
    handleCancel,
  ]);

  // Validate on blur
  const handleBlurValidate = useCallback(() => {
    const validation = validateDraft(draft);
    setErrors(validation);
    if (invalidCount > 0) setInvalidCount(Object.keys(validation).length);
  }, [draft, invalidCount]);

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
          setSaveError(writeErrorText(err, "save", t, locale));
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
    [t, isNew, delta, editBase, finishSave, router, routeId, onIdChange, locale],
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
    setInvalidCount(Object.keys(validation).length);
    if (!isValid(validation)) {
      // The first field to correct may be out of sight, far above the bar.
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>('article [aria-invalid="true"]');
        field?.scrollIntoView?.({ block: "center" });
        field?.focus({ preventScroll: true });
      });
      return;
    }

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

  useEditShortcuts({
    edit,
    busy,
    deleting,
    onToggleEdit: handleToggleEdit,
    onEscape: handleEscape,
    onSave: handleSave,
  });

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
    // Only what the draft still asks for: a chip taken back since is dropped.
    const wanted = groupFailures.filter((f) =>
      (f.kind === "add" ? delta.added : delta.removed).includes(f.name),
    );
    const { written, remaining } = await retryGroupFailures(
      auth,
      wanted,
      editBase.uid,
      groupRetries.current,
    );
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
      else setSaveError(writeErrorText(err, "delete", t, locale));
    }
  }, [editBase, deleteContact, router, showToast, t, locale]);

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
          setSaveError(writeErrorText(outcome.error, "move", t, locale));
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
    [auth, editBase, selectedBook, selectBook, queryClient, router, showToast, t, locale],
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

  // What a save writes back unseen, from the version edited.
  const unshown = useMemo(() => unshownPropertiesOf(editBase), [editBase]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    // In edit mode the page fills the screen, so the bottom bar sits at its foot
    // even when the form is short.
    <article
      aria-labelledby="fiche-title"
      data-mode={edit ? "edit" : "view"}
      className={edit ? "flex min-h-dvh flex-col lg:min-h-full" : undefined}
    >
      {edit ? (
        <MobileTopBar label={isNew ? t("new_contact") : t("edit_label")} />
      ) : (
        <MobileTopBar onEdit={() => enterEdit()} />
      )}
      <h1 id="fiche-title" className="sr-only">
        {pageName}
      </h1>
      <div id="fiche-top" />

      {edit ? (
        <ContactEditor
          contact={editBase}
          isNew={isNew}
          draft={draft}
          dispatch={dispatch}
          errors={errors}
          onBlurValidate={handleBlurValidate}
          groups={isNew ? null : draftGroups}
          groupSuggestions={groupSuggestions}
          onGroupsChange={setDraftGroups}
          photo={{
            canChange: canChangePhoto,
            shown: showsPhoto,
            inputRef: photoInputRef,
            buttonRef: changePhotoRef,
            onFile: (file) => void handlePhotoFile(file),
          }}
          unknownCount={unshown.length}
          onShowUnknown={() => setShowUnshown(true)}
          move={
            !isNew && otherBooks.length > 0
              ? { disabled: busy || hasChanges, hint: hasChanges, onClick: () => setShowMove(true) }
              : undefined
          }
          onDelete={isNew ? undefined : () => setShowDelete(true)}
          busy={busy}
        />
      ) : (
        <ContactView contact={contact} groups={groups} onEdit={enterEdit} onCopy={handleCopy} />
      )}

      {edit && (
        <ContactEditBar
          conflict={conflict}
          deleteConflict={deleteConflict}
          groupFailures={groupFailures}
          saveError={saveError}
          invalidCount={invalidCount}
          saving={saveStatus === "saving"}
          busy={busy}
          deleting={deleting}
          onCancel={handleCancel}
          onSave={() => void handleSave()}
          onReload={handleConflictReload}
          onOverwrite={() => void handleConflictOverwrite()}
          onGroupOverwrite={() => void handleGroupOverwrite()}
        />
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

      {showUnshown && (
        <UnshownPropertiesDialog lines={unshown} onClose={() => setShowUnshown(false)} />
      )}

      {showDelete && (
        <ConfirmDialog
          title={t("delete_title", { name: pageName })}
          body={t("delete_body")}
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
