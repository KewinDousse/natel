/**
 * ContactList — the directory list pane: toolbar (count, group filter, sort toggle),
 * letter-grouped rows, and the A–Z rail. Group/letter/sort/search logic lives
 * in src/lib/contact-list.ts; this file only composes and styles it.
 */

import { Link, useRouter } from "@tanstack/react-router";
import type { PointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { useI18n } from "@/i18n/react";
import { bookGroups, contactsInGroup } from "@/lib/contact-groups";
import {
  ALPHABET,
  buildGroups,
  type ContactGroup,
  contactIdOf,
  type HighlightSegment,
  isOrgCard,
  isUnnamed,
  namePartsOf,
  OTHER_GROUP,
  orderedNameOf,
  railTarget,
  type SortBy,
  splitByQuery,
  trailingValueOf,
} from "@/lib/contact-list";
import { formatPhone } from "@/lib/format-phone";
import { isDesktop, isDialogOpen, isInMenu, isTyping } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { Contact } from "@/model/contact";
import { buttonClass, FOCUS_RING } from "./button";
import { GroupFilter } from "./group-filter";
import { PlusIcon, RefreshIcon, UploadIcon } from "./icons";
import { BuildingAvatar, InitialsAvatar, PhotoAvatar } from "./photo-avatar";

/** Why the book shows no list: still loading, or a load that failed. */
export type ListLoad = { kind: "loading" } | { kind: "failed"; expired: boolean };

type ContactListProps = {
  /** Contacts of the selected book; undefined while the book is loading. */
  contacts: Contact[] | undefined;
  /** Discovery returned zero address books — dedicated state, no crash. */
  noBooks: boolean;
  /** While `contacts` is undefined: loading, or why it failed. */
  load: ListLoad;
  onRetry: () => void;
  /** Present once the book can take new contacts, for the empty book's actions. */
  onImport?: (file: File) => void;
  query: string;
  sortBy: SortBy;
  onSortBy: (sortBy: SortBy) => void;
  /** The book's group cards, which the group filter reads with CATEGORIES. */
  groupCards: Contact[];
  /** The group the list is filtered on, or null for every contact. */
  groupFilter: string | null;
  onGroupFilter: (name: string | null) => void;
};

export function ContactList({
  contacts,
  noBooks,
  load,
  onRetry,
  onImport,
  query,
  sortBy,
  onSortBy,
  groupCards,
  groupFilter,
  onGroupFilter,
}: ContactListProps) {
  const { t } = useI18n();
  const bookGroupList = useMemo(
    () => bookGroups(contacts ?? [], groupCards),
    [contacts, groupCards],
  );
  // A group that no longer exists filters nothing.
  const activeGroup = bookGroupList.some((group) => group.name === groupFilter)
    ? groupFilter
    : null;
  const listed = useMemo(
    () =>
      activeGroup === null
        ? (contacts ?? [])
        : contactsInGroup(contacts ?? [], groupCards, activeGroup),
    [contacts, groupCards, activeGroup],
  );
  const groups = useMemo(() => buildGroups(listed, sortBy, query), [listed, sortBy, query]);
  // A group gone from the book ends the filter, which doesn't come back with it.
  useEffect(() => {
    if (contacts !== undefined && groupFilter !== null && activeGroup === null) {
      onGroupFilter(null);
    }
  }, [contacts, groupFilter, activeGroup, onGroupFilter]);
  const shown = groups.reduce((total, group) => total + group.contacts.length, 0);
  const searching = query.trim().length > 0;
  useArrowNavigation(groups);

  if (noBooks) {
    return (
      <ListShell>
        <StateBox title={t("no_books")} />
      </ListShell>
    );
  }
  if (contacts === undefined) {
    return (
      <ListShell busy={load.kind === "loading"}>
        {load.kind === "loading" ? (
          <ListSkeleton />
        ) : load.expired ? (
          <StateBox title={t("session_expired_title")} hint={t("session_expired_body")}>
            <Link to="/logout" className={buttonClass()}>
              {t("sign_in_again")}
            </Link>
          </StateBox>
        ) : (
          <StateBox title={t("load_failed_title")} hint={t("load_failed_body")}>
            <button type="button" onClick={onRetry} className={buttonClass()}>
              <RefreshIcon />
              {t("retry")}
            </button>
          </StateBox>
        )}
      </ListShell>
    );
  }

  const countLabel = searching
    ? shown === 0
      ? t("results_0")
      : shown === 1
        ? t("results_1")
        : t("results_n", { n: String(shown) })
    : activeGroup !== null
      ? listed.length === 1
        ? t("count_in_group_1", { group: activeGroup })
        : t("count_in_group", { n: String(listed.length), group: activeGroup })
      : contacts.length === 1
        ? t("count_1")
        : t("count", { n: String(contacts.length) });

  const showEmptyBook = !searching && contacts.length === 0;
  const showEmptyGroup = !searching && !showEmptyBook && listed.length === 0;
  const showNoResults = searching && shown === 0;

  return (
    <ListShell>
      {/* On phones the group filter takes its own row, under the count and sort. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-1 pt-3">
        <p className="mr-auto text-caption text-muted-foreground" aria-live="polite">
          <span className="tabular">{countLabel}</span>
        </p>
        {bookGroupList.length > 0 && (
          <GroupFilter
            groups={bookGroupList}
            selected={activeGroup}
            onSelect={onGroupFilter}
            className="order-last basis-full sm:order-none sm:basis-auto"
          />
        )}
        <fieldset
          aria-label={t("sort_label")}
          className="m-0 inline-flex items-center gap-1 border-0 p-0 text-caption"
        >
          <button
            type="button"
            aria-pressed={sortBy === "given"}
            onClick={() => onSortBy("given")}
            className={SORT_PILL}
          >
            {t("sort_given")}
          </button>
          <button
            type="button"
            aria-pressed={sortBy === "family"}
            onClick={() => onSortBy("family")}
            className={SORT_PILL}
          >
            {t("sort_family")}
          </button>
        </fieldset>
      </div>

      {showEmptyBook ? (
        <EmptyBook onImport={onImport} />
      ) : showEmptyGroup ? (
        <StateBox title={t("group_empty")} />
      ) : showNoResults ? (
        <StateBox title={t("results_0")} hint={t("empty_hint")} />
      ) : (
        <>
          {groups.map((group) => (
            <GroupSection key={group.letter} group={group} query={query} sortBy={sortBy} />
          ))}
          <AlphabetRail
            present={new Set(groups.filter((g) => g.letter !== OTHER_GROUP).map((g) => g.letter))}
            hidden={searching}
          />
        </>
      )}
    </ListShell>
  );
}

/**
 * `↑` / `↓` open the previous / next contact in the list as shown, on desktop
 * where both panes are visible. With none open, `↓` opens the first and `↑`
 * the last. A focused row hands its focus on, so Tab and Enter carry on from
 * the new one.
 */
function useArrowNavigation(groups: ContactGroup[]) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.shiftKey) return;
      if (isTyping(event.target) || isInMenu(event.target) || isDialogOpen() || !isDesktop())
        return;
      const ids = groups.flatMap((group) => group.contacts.map(contactIdOf));
      if (ids.length === 0) return;
      // The latest location, not the rendered one: a key pressed right after
      // the last one must move on from where that one went.
      const match = /^\/contacts\/([^/]+)$/.exec(router.latestLocation.pathname);
      const at = match?.[1] ? ids.indexOf(decodeURIComponent(match[1])) : -1;
      const next =
        event.key === "ArrowDown"
          ? at === -1
            ? 0
            : Math.min(at + 1, ids.length - 1)
          : at === -1
            ? ids.length - 1
            : Math.max(at - 1, 0);
      const target = ids[next];
      if (target === undefined || next === at) return;
      event.preventDefault();
      const rowFocused = document.activeElement?.closest("#list") != null;
      void router.navigate({ to: "/contacts/$id", params: { id: target } }).then(() => {
        // A navigation the discard dialog held back settles only with a
        // later one: act only if this row is still the open contact.
        const row = document.querySelector<HTMLElement>(
          `#list a[data-contact-id="${CSS.escape(target)}"][data-status="active"]`,
        );
        row?.scrollIntoView({ block: "nearest" });
        if (rowFocused && !isDialogOpen()) row?.focus();
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [groups, router]);
}

function ListShell({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  const { t } = useI18n();
  // From lg the list scrolls itself; its right margin keeps the scrollbar
  // clear of the rail, which sits outside it.
  return (
    <nav
      id="list"
      aria-label={t("list_label")}
      aria-busy={busy || undefined}
      className="pb-24 pl-2 pr-7 lg:mr-8 lg:h-full lg:overflow-y-auto lg:pb-10 lg:pr-2"
    >
      {children}
    </nav>
  );
}

function StateBox({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="font-display text-3xl font-bold leading-tight text-balance">{title}</p>
      {hint && (
        <p className="mx-auto mt-2 max-w-xs text-sm leading-snug text-muted-foreground">{hint}</p>
      )}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/** A new book's first screen: what to do with it. */
function EmptyBook({ onImport }: { onImport?: (file: File) => void }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <StateBox title={t("book_empty")} hint={t("book_empty_hint")}>
      <Link to="/contacts/new" className={buttonClass({}, "pl-3")}>
        <PlusIcon className="size-4" />
        {t("new_contact")}
      </Link>
      {onImport && (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={buttonClass({ variant: "outline" }, "pl-3")}
          >
            <UploadIcon />
            {t("import_vcf")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".vcf,text/vcard,text/x-vcard"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onImport(file);
            }}
          />
        </>
      )}
    </StateBox>
  );
}

/** Rows standing in for the book while it loads. */
function ListSkeleton() {
  const { t } = useI18n();
  const widths = ["w-40", "w-28", "w-36", "w-44", "w-32", "w-24", "w-48", "w-20"];
  return (
    <div className="pt-12">
      <p role="status" className="sr-only">
        {t("loading_contacts")}
      </p>
      <div className="grid grid-cols-[2.75rem_1fr] sm:grid-cols-[4rem_1fr] lg:grid-cols-[4.25rem_1fr]">
        <span aria-hidden="true" />
        <ul aria-hidden="true" className="animate-pulse">
          {widths.map((width) => (
            <li
              key={width}
              className="flex min-h-[3.5rem] items-center gap-3 px-2 sm:min-h-[3.25rem]"
            >
              <span className="size-10 shrink-0 rounded-lg bg-muted" />
              <span className={cn("h-3.5 rounded-full bg-muted", width)} />
              <span className="ml-auto hidden h-3.5 w-24 rounded-full bg-muted sm:block" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function GroupSection({
  group,
  query,
  sortBy,
}: {
  group: ContactGroup;
  query: string;
  sortBy: SortBy;
}) {
  return (
    <section
      id={`g-${group.letter}`}
      className="grid scroll-mt-[calc(var(--header-h)+0.125rem)] grid-cols-[2.75rem_1fr] border-t py-2 first:border-t-0 sm:grid-cols-[4rem_1fr] lg:scroll-mt-0 lg:grid-cols-[4.25rem_1fr]"
    >
      <h2 className="sticky top-[var(--header-h)] self-start pl-2 pt-2 font-display text-title-sm font-bold leading-[0.8] text-brand sm:text-title lg:top-2 lg:text-index">
        {group.letter}
      </h2>
      {/* biome-ignore lint/a11y/noRedundantRoles: DESIGN.md mandates <ul role="list"> */}
      <ul role="list" className="min-w-0">
        {group.contacts.map((contact) => (
          <ContactRow key={contact.href} contact={contact} query={query} sortBy={sortBy} />
        ))}
      </ul>
    </section>
  );
}

function ContactRow({
  contact,
  query,
  sortBy,
}: {
  contact: Contact;
  query: string;
  sortBy: SortBy;
}) {
  const { family, given } = namePartsOf(contact);
  const { lead, rest, display } = orderedNameOf(contact, sortBy);
  const trailing = trailingValueOf(contact);
  const id = contactIdOf(contact);
  const orgCard = isOrgCard(contact);
  const unnamed = isUnnamed(contact);
  const { t } = useI18n();

  const nameValue = unnamed ? (
    <span className="italic text-muted-foreground">{t("contact_unnamed")}</span>
  ) : (
    <>
      <b className="font-bold">
        <Marked value={lead} query={query} />
      </b>
      {rest && (
        <>
          {" "}
          <span>
            <Marked value={rest} query={query} />
          </span>
        </>
      )}
    </>
  );

  return (
    <li>
      {/*
        The router's Link marks the active row with aria-current="page" and
        data-status="active"; the design's aria-[current=true] classes target
        that attribute, so the "true" token is matched through data-status
        instead (same a11y contract, styles live on the router's marker).
      */}
      <Link
        to="/contacts/$id"
        params={{ id }}
        data-contact-id={id}
        className="group relative flex min-h-[3.5rem] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted data-[status=active]:bg-selection data-[status=active]:text-selection-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-[3.25rem] sm:py-0"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-brand opacity-0 transition-opacity group-data-[status=active]:opacity-100"
        />
        <PhotoAvatar
          contact={contact}
          lazy
          className="size-10 rounded-lg"
          fallback={
            orgCard ? (
              <BuildingAvatar className="size-10 rounded-lg" />
            ) : (
              <InitialsAvatar
                family={family}
                given={given}
                seed={contact.uid || contact.href}
                className="size-10 rounded-lg text-lg"
              />
            )
          }
        />
        <span className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
          <span
            className="block min-w-0 truncate text-base sm:text-body"
            title={unnamed ? t("contact_unnamed") : display}
          >
            {nameValue}
          </span>
          {trailing && <span className="leader hidden sm:block" aria-hidden="true" />}
          {trailing &&
            (trailing.kind === "tel" ? (
              <span className="block truncate text-sm tabular text-muted-foreground sm:shrink-0 sm:text-body sm:text-foreground">
                <TelMarked value={trailing.value} query={query} />
              </span>
            ) : (
              <span className="block truncate text-sm text-muted-foreground sm:max-w-[42%] sm:shrink-0">
                <Marked value={trailing.value} query={query} />
              </span>
            ))}
        </span>
      </Link>
    </li>
  );
}

/** <mark> around every fold-insensitive match inside `value`. */
function Marked({ value, query }: { value: string; query: string }) {
  const segments: HighlightSegment[] = splitByQuery(value, query);
  if (segments.length === 1 && !(segments[0]?.hit ?? false)) return <>{value}</>;
  return <MarkedSegments segments={segments} />;
}

/**
 * Like Marked but for phone numbers: also matches digit-only queries against
 * the digit form of the displayed value. When a digit query matches the
 * digits-only form, the entire formatted value is marked.
 */
function TelMarked({ value, query }: { value: string; query: string }) {
  const formatted = formatPhone(value);
  const segments = splitByQuery(formatted, query);
  if (segments.length > 1 || (segments[0]?.hit ?? false)) {
    return <MarkedSegments segments={segments} />;
  }
  const qDigits = query.replace(/[\s.+-]/g, "");
  if (qDigits.length >= 3) {
    const formattedDigits = formatted.replace(/[\s.+-]/g, "");
    const digitSegments = splitByQuery(formattedDigits, qDigits);
    if (digitSegments.length > 1 || (digitSegments[0]?.hit ?? false)) {
      return <mark>{formatted}</mark>;
    }
  }
  return <>{formatted}</>;
}

function MarkedSegments({ segments }: { segments: HighlightSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static display segments
          <mark key={index}>{segment.text}</mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: same as above
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/**
 * A–Z rail — absent letters are aria-hidden and out of the tab order; anchors
 * jump without smooth scrolling. Hidden entirely while a search is active.
 * On touch, a tap or a finger sliding along the rail scrolls to the letter
 * under it, as native contact apps do; the anchors serve mouse and keyboard.
 */
function AlphabetRail({ present, hidden }: { present: Set<string>; hidden: boolean }) {
  const { t } = useI18n();
  const shown = useRef<string | null>(null);

  function jumpTo(event: PointerEvent<HTMLElement>) {
    const letters = event.currentTarget.querySelectorAll<HTMLElement>("[data-letter]");
    const first = letters[0]?.getBoundingClientRect();
    const last = letters[letters.length - 1]?.getBoundingClientRect();
    if (!first || !last) return;
    const step = (last.bottom - first.top) / letters.length;
    const index = Math.min(
      letters.length - 1,
      Math.max(0, Math.floor((event.clientY - first.top) / step)),
    );
    const target = railTarget(ALPHABET.split(""), present, index);
    if (!target || target === shown.current) return;
    shown.current = target;
    document.getElementById(`g-${target}`)?.scrollIntoView();
  }

  return (
    <nav
      id="rail"
      hidden={hidden}
      aria-label={t("index_label")}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        shown.current = null;
        jumpTo(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) jumpTo(event);
      }}
      className="fixed bottom-6 right-0.5 top-[calc(var(--header-h)+0.875rem)] z-10 flex touch-none select-none flex-col [-webkit-touch-callout:none] items-center justify-center font-display text-small font-bold leading-none lg:absolute lg:bottom-4 lg:right-1.5 lg:top-4"
    >
      {ALPHABET.split("").map((letter) => {
        if (present.has(letter)) {
          return (
            <a
              key={letter}
              href={`#g-${letter}`}
              data-letter={letter}
              className="grid h-4 w-5 place-items-center rounded-sm text-foreground transition-colors hover:text-brand"
            >
              {letter}
            </a>
          );
        }
        // Absent letters are not navigable: a span, hidden from assistive tech.
        return (
          <span
            key={letter}
            data-letter={letter}
            aria-hidden="true"
            className="pointer-events-none grid h-4 w-5 place-items-center rounded-sm text-leader"
          >
            {letter}
          </span>
        );
      })}
    </nav>
  );
}

/** The sort toggle's pills: small to look at, a full row high to tap. */
const SORT_PILL = cn(
  "relative rounded-full px-2 py-0.5 font-bold text-muted-foreground transition-colors after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] aria-pressed:bg-secondary aria-pressed:text-foreground",
  FOCUS_RING,
);
