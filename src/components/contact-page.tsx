/**
 * ContactPage — the contact detail page in view and edit mode, per DESIGN.md
 * "Contact page: one skeleton, two states".
 *
 * Renders inside the detail pane's Outlet. The same route/page toggles
 * data-mode view⇄edit; `?edit` in the URL reflects and drives it.
 */

import { useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import {
  applyDraft,
  buildDraft,
  type ContactDraft,
  dirtyDiff,
  isDirty,
  isValid,
  nextId,
  type ValidationErrors,
  validateDraft,
} from "@/lib/contact-edit";
import { contactById, contactIdOf, namePartsOf, primaryNumberOf } from "@/lib/contact-list";
import { birthdayDateTime, formatBirthday } from "@/lib/format-birthday";
import { formatPhone } from "@/lib/format-phone";
import { cn } from "@/lib/utils";
import type { Contact, ContactField } from "@/model/contact";
import { DavError, useRefetchCard, useUpdateContact } from "@/queries";
import { useAuth } from "@/store/session";
import {
  addressOf,
  birthdayOf,
  groupsOf,
  jobTitleOf,
  noteOf,
  orgOf,
  parse,
  typeValuesOf,
  type VCardAddress,
} from "@/vcard";
import { EditableCell } from "./editable-cell";

type ContactPageProps = {
  /** Contacts of the selected book; undefined while the book is loading. */
  contacts: Contact[] | undefined;
  /** The /contacts/$id route parameter. */
  id: string;
  /** True when ?edit is in the URL. */
  edit?: boolean;
};

/**
 * The page for one contact. While the book is loading it renders the mobile
 * top bar alone (no blank pane). Once loaded, an id outside the book gets
 * an honest not-found state.
 */
export function ContactPage({ contacts, id, edit = false }: ContactPageProps) {
  if (contacts === undefined) return null;
  const contact = contactById(contacts, id);
  if (contact === undefined) return <NotFoundView />;
  return <ContactFiche contact={contact} edit={edit} />;
}

// ---------------------------------------------------------------------------
// Mobile top bar
// ---------------------------------------------------------------------------

function MobileTopBar({ editLabel }: { editLabel?: string }) {
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
      {editLabel !== undefined && (
        <span className="ml-auto mr-2 text-sm font-bold text-muted-foreground">{editLabel}</span>
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
// Helpers
// ---------------------------------------------------------------------------

/** Parse an integer from a string, returning NaN for invalid input. */
function safeParseInt(value: string): number | null {
  if (value.length === 0) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
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
  | { type: "ADD_BDAY"; value: string }
  | { type: "SET_ORG"; value: string }
  | { type: "SET_TITLE"; value: string }
  | { type: "SET_URL"; value: string }
  | { type: "SET_NOTE"; value: string };

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
        adr: { ...state.adr, type: action.value.length > 0 ? [action.value] : [] },
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
      return {
        ...state,
        bday: state.bday
          ? {
              ...state.bday,
              year: action.value.length > 0 ? safeParseInt(action.value) : null,
            }
          : null,
      };
    case "SET_BDAY_MONTH":
      return {
        ...state,
        bday: state.bday
          ? {
              ...state.bday,
              month: action.value.length > 0 ? safeParseInt(action.value) : null,
            }
          : null,
      };
    case "SET_BDAY_DAY":
      return {
        ...state,
        bday: state.bday
          ? {
              ...state.bday,
              day: action.value.length > 0 ? safeParseInt(action.value) : null,
            }
          : null,
      };
    case "ADD_BDAY":
      if (state.bday) return state;
      return {
        ...state,
        bday: { source: action.value, year: null, month: null, day: null },
      };
    case "SET_ORG":
      return { ...state, org: action.value };
    case "SET_TITLE":
      return { ...state, title: action.value };
    case "SET_URL":
      return { ...state, url: action.value };
    case "SET_NOTE":
      return { ...state, note: action.value };
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
 */
function ContactFiche({ contact, edit }: { contact: Contact; edit: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const auth = useAuth() as Exclude<ReturnType<typeof useAuth>, null>;
  const updateContact = useUpdateContact(auth);
  const refetchCard = useRefetchCard(auth);
  const queryClient = useQueryClient();

  // Derived display values (view mode)
  const parts = useMemo(() => namePartsOf(contact), [contact]);
  const orgOnly = parts.display.length === 0;
  const jobTitle = useMemo(() => jobTitleOf(contact), [contact]);
  const org = useMemo(() => orgOf(contact), [contact]);
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
  const groups = useMemo(() => groupsOf(contact), [contact]);

  // Route id for navigation
  const routeId = contactIdOf(contact);

  // Edit state
  const initialDraft = useMemo(() => buildDraft(contact), [contact]);
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const draftPrimary = useMemo(
    () => draft.tel.find((f) => f.type === "cell") ?? draft.tel[0],
    [draft.tel],
  );
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [conflict, setConflict] = useState<
    { kind: "none" } | { kind: "conflict"; serverEtag: string }
  >({
    kind: "none",
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);

  // Dirty detection
  const dirty = useMemo(() => dirtyDiff(contact, draft), [contact, draft]);
  const hasChanges = isDirty(dirty);

  // Reset draft when contact changes (e.g. after reload from conflict)
  const prevEdit = useRef(edit);
  useEffect(() => {
    if (edit && !prevEdit.current) {
      dispatch({ type: "REBUILD", draft: buildDraft(contact) });
    }
    prevEdit.current = edit;
  }, [edit, contact]);

  // Exit edit mode
  const exitEdit = useCallback(() => {
    dispatch({ type: "REBUILD", draft: buildDraft(contact) });
    setErrors({});
    setConflict({ kind: "none" });
    router.navigate({ to: "/contacts/$id", params: { id: routeId }, replace: true });
  }, [contact, router, routeId]);

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
      if (e.key === "e" || e.key === "E") {
        if (
          document.activeElement &&
          (document.activeElement.tagName === "INPUT" ||
            document.activeElement.tagName === "TEXTAREA" ||
            document.activeElement.tagName === "SELECT")
        )
          return;
        handleToggleEdit();
      }
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

  useEffect(() => {
    if (!edit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [edit, handleCancel]);

  // History blocker — intercept back/forward when dirty using TanStack Router's blocker API
  const blocker = useBlocker({
    shouldBlockFn: () => hasChanges,
    disabled: !edit,
    withResolver: true,
  });

  // When the blocker fires, show the discard dialog
  const blockerActive = blocker?.status === "blocked";
  useEffect(() => {
    if (blockerActive) {
      setShowDiscard(true);
    }
  }, [blockerActive]);

  // Validate on blur
  const handleBlurValidate = useCallback(() => {
    setErrors(validateDraft(draft));
  }, [draft]);

  // Save — applies draft to a clone so the cached contact is not mutated
  // on failure (item 14), and surfaces non-CONFLICT errors in the bar (item 13).
  const handleSave = useCallback(async () => {
    const validation = validateDraft(draft);
    setErrors(validation);
    if (!isValid(validation)) return;

    setSaveStatus("saving");
    setSaveError(null);
    setConflict({ kind: "none" });

    // Clone fields AND raw to avoid mutating the cached contact on failure:
    // serialise() mutates `raw` in place, so a simple structuredClone of
    // fields is insufficient. Re-parse the raw text to get a fully detached copy.
    const vcardText = contact.raw.toString();
    const detachedContact = parse(vcardText, contact.href, contact.etag);
    applyDraft(detachedContact, draft);

    try {
      await updateContact.mutateAsync(detachedContact);
      setToast(t("saved"));
      setSaveStatus("idle");
      setTimeout(() => setToast(null), 2500);
      router.navigate({
        to: "/contacts/$id",
        params: { id: routeId },
        replace: true,
      });
    } catch (err) {
      setSaveStatus("idle");
      if (err instanceof DavError && err.code === "CONFLICT") {
        setConflict({ kind: "conflict", serverEtag: "" });
      } else if (err instanceof DavError && err.code === "NETWORK") {
        setSaveError(t("err_save_network"));
      } else if (err instanceof DavError && err.code === "AUTH") {
        setSaveError(t("err_save_auth"));
      } else {
        setSaveError(t("err_save_unexpected"));
      }
    }
  }, [draft, contact, updateContact, t, router, routeId]);

  // Conflict — reload by invalidating the contact query and exiting edit
  const handleConflictReload = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
    exitEdit();
  }, [queryClient, exitEdit]);

  // Conflict — overwrite: refetch for a fresh ETag first, then PUT
  const handleConflictOverwrite = useCallback(async () => {
    setConflict({ kind: "none" });
    setSaveStatus("saving");
    setSaveError(null);
    try {
      // Refetch the card for a fresh ETag via the queries layer
      const freshContact = await refetchCard(contact.href);
      // Apply draft to the fresh copy
      applyDraft(freshContact, draft);
      await updateContact.mutateAsync(freshContact);
      setToast(t("saved"));
      setSaveStatus("idle");
      setTimeout(() => setToast(null), 2500);
      router.navigate({
        to: "/contacts/$id",
        params: { id: routeId },
        replace: true,
      });
    } catch (err) {
      setSaveStatus("idle");
      if (err instanceof DavError && err.code === "CONFLICT") {
        setConflict({ kind: "conflict", serverEtag: "" });
      } else if (err instanceof DavError && err.code === "NETWORK") {
        setSaveError(t("err_save_network"));
      } else if (err instanceof DavError && err.code === "AUTH") {
        setSaveError(t("err_save_auth"));
      } else {
        setSaveError(t("err_save_unexpected"));
      }
    }
  }, [draft, contact, refetchCard, updateContact, t, router, routeId]);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast !== null) {
      const timer = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Copy handler
  const handleCopy = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setToast(t("copied"));
        setTimeout(() => setToast(null), 2500);
      } catch {
        // silent
      }
    },
    [t],
  );

  const unknownCount = countUnknownProperties(contact.raw);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <article
      ref={articleRef}
      className="group/fiche"
      data-mode={edit ? "edit" : "view"}
      aria-labelledby="fiche-title"
    >
      <MobileTopBar editLabel={edit ? t("edit_label") : undefined} />
      <div className="mx-auto w-full max-w-[44rem] px-5 pb-28 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14">
        <h1 id="fiche-title" className="sr-only">
          {parts.display.length > 0 ? parts.display : org}
        </h1>

        {/* Top row: avatar + desktop edit button */}
        <div className="flex items-start justify-between gap-6">
          {orgOnly ? (
            <BuildingAvatar />
          ) : (
            <InitialsAvatar family={parts.family} given={parts.given} />
          )}
          <div className="hidden lg:block">
            {edit ? (
              <span className="inline-flex h-10 items-center rounded-full px-4 text-sm font-bold text-muted-foreground">
                {t("edit_label")}
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
            view={<span className="truncate">{parts.family}</span>}
            edit={
              <div className="relative">
                <input
                  type="text"
                  value={draft.family}
                  onChange={(e) => dispatch({ type: "SET_FAMILY", value: e.target.value })}
                  onBlur={handleBlurValidate}
                  aria-invalid={errors.family !== undefined}
                  aria-describedby={errors.family ? "err-family" : undefined}
                  className={cn(
                    "h-12 w-full rounded-md border bg-card px-3.5 font-display text-[2.25rem] font-bold leading-none tracking-[-0.005em] sm:h-14 sm:text-[2.75rem] lg:h-15 lg:text-person",
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
                    onChange={(e) => dispatch({ type: "SET_GIVEN", value: e.target.value })}
                    onBlur={handleBlurValidate}
                    aria-invalid={errors.given !== undefined}
                    aria-describedby={errors.given ? "err-given" : undefined}
                    className={cn(
                      "h-12 w-full rounded-md border bg-card px-3.5 font-display text-[2.25rem] font-bold leading-none tracking-[-0.005em] text-muted-foreground sm:h-14 sm:text-[2.75rem] lg:h-15 lg:text-person",
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
                  onChange={(e) => dispatch({ type: "SET_TITLE", value: e.target.value })}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base lg:text-[0.9375rem]"
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
                  onChange={(e) => dispatch({ type: "SET_ORG", value: e.target.value })}
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base lg:text-[0.9375rem]"
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
                        value={draft.adr.type[0] ?? ""}
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
                          placeholder="JJ"
                          value={draft.bday.day !== null ? String(draft.bday.day) : ""}
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
                          placeholder="MM"
                          value={draft.bday.month !== null ? String(draft.bday.month) : ""}
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
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="AAAA"
                        value={draft.bday.year !== null ? String(draft.bday.year) : ""}
                        onChange={(e) => dispatch({ type: "SET_BDAY_YEAR", value: e.target.value })}
                        className="h-11 w-24 rounded-md border border-input bg-card px-3 text-center text-base lg:text-[0.9375rem]"
                      />
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

          {/* Groups — read-only in edit */}
          {groups.length > 0 && (
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
                        <a
                          href={contact.fields.url}
                          className="block min-w-0 truncate hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {contact.fields.url}
                        </a>
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
                <AddPill
                  label={t("add_bday")}
                  onClick={() => dispatch({ type: "ADD_BDAY", value: "" })}
                />
              )}
            </div>
            {unknownCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {unknownCount === 1
                  ? t("preserved_fields_1")
                  : t("preserved_fields", { n: String(unknownCount) })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sticky bottom bar — edit only */}
      {edit && (
        <div className="sticky bottom-0 z-30 border-t bg-background px-4 py-3 shadow-float">
          {conflict.kind === "conflict" && (
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

          {saveError !== null && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2">
              <p className="text-sm text-destructive">{saveError}</p>
            </div>
          )}

          <div className="mx-auto flex max-w-[44rem] items-center gap-3">
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex h-10 items-center rounded-full border border-input bg-background px-4 text-sm font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === "saving"}
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

      {/* Toast */}
      {toast !== null && (
        <div
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background shadow-float"
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      )}

      {/* Discard dialog */}
      {showDiscard && (
        <div
          onClick={() => {
            setShowDiscard(false);
            if (blockerActive) blocker?.reset?.();
          }}
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setShowDiscard(false);
              if (blockerActive) blocker?.reset?.();
            }
          }}
        >
          <div
            role="document"
            className="w-full max-w-md rounded-t-xl bg-background p-6 shadow-overlay sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={() => {}}
          >
            <h2 className="font-display text-2xl font-bold leading-tight">{t("discard_title")}</h2>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowDiscard(false);
                  if (blockerActive) blocker?.reset?.();
                }}
                className="inline-flex h-10 items-center justify-center rounded-full border border-input bg-background px-4 text-sm font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("discard_continue")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscard(false);
                  if (blockerActive) {
                    blocker?.proceed?.();
                  } else {
                    exitEdit();
                  }
                }}
                className="inline-flex h-10 items-center justify-center rounded-full bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:bg-destructive/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t("discard_abandon")}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
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
    <section id={sectionId} className="border-t-2 border-foreground pt-1.5">
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

function TypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <select
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
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={adr.street}
        onChange={(e) => dispatch({ type: "SET_ADR_STREET", value: e.target.value })}
        className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base lg:text-[0.9375rem]"
      />
      <div className="grid grid-cols-[5.5rem_1fr] gap-1">
        <input
          type="text"
          inputMode="numeric"
          value={adr.postalCode}
          onChange={(e) => dispatch({ type: "SET_ADR_POSTAL_CODE", value: e.target.value })}
          className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base lg:text-[0.9375rem]"
        />
        <input
          type="text"
          value={adr.locality}
          onChange={(e) => dispatch({ type: "SET_ADR_LOCALITY", value: e.target.value })}
          className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-base lg:text-[0.9375rem]"
        />
      </div>
      <input
        type="text"
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
