/**
 * ContactList — the directory list pane: the toolbar (count, group filter,
 * sort toggle), the letter sections (contact-row.tsx) and the A–Z rail
 * (alphabet-rail.tsx). Group, letter, sort and search logic lives in
 * src/lib/contact-list.ts; this file only composes and styles it.
 */

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { useI18n } from "@/i18n/react";
import { bookGroups, contactsInGroup } from "@/lib/contact-groups";
import { buildGroups, OTHER_GROUP, type SortBy } from "@/lib/contact-list";
import { cn } from "@/lib/utils";
import type { Contact } from "@/model/contact";
import { AlphabetRail } from "./alphabet-rail";
import { buttonClass, FOCUS_RING } from "./button";
import { GroupSection } from "./contact-row";
import { GroupFilter } from "./group-filter";
import { AlertIcon, RefreshIcon } from "./icons";
import { EmptyBook, ListSkeleton, SignInAgain, StateBox } from "./list-states";
import { useArrowNavigation } from "./use-arrow-navigation";

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
  onRetryCards?: () => void;
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
  skippedCount?: number;
  retrying?: boolean;
};

export function ContactList({
  contacts,
  noBooks,
  load,
  onRetry,
  onRetryCards,
  onImport,
  query,
  sortBy,
  onSortBy,
  groupCards,
  groupFilter,
  onGroupFilter,
  skippedCount = 0,
  retrying = false,
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
  const warning = (
    <IncompleteBookWarning
      count={contacts === undefined ? 0 : skippedCount}
      retrying={retrying}
      onRetry={onRetryCards ?? onRetry}
    />
  );

  if (noBooks) {
    return (
      <ListShell warning={warning}>
        <StateBox title={t("no_books")} />
      </ListShell>
    );
  }
  if (contacts === undefined) {
    return (
      <ListShell warning={warning} busy={load.kind === "loading"}>
        {load.kind === "loading" ? (
          <ListSkeleton />
        ) : load.expired ? (
          <StateBox title={t("session_expired_title")} hint={t("session_expired_body")}>
            <SignInAgain />
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

  const showIncompleteBook = contacts.length === 0 && skippedCount > 0;
  const showEmptyBook = !searching && contacts.length === 0 && !showIncompleteBook;
  const showEmptyGroup = !searching && !showEmptyBook && listed.length === 0;
  const showNoResults = searching && shown === 0;

  return (
    <ListShell warning={warning}>
      {/* The sort is a setting too: on phones the toolbar keeps the count and the filter. */}
      <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pb-1 pt-3 text-sm">
        <p className="mr-auto text-muted-foreground" aria-live="polite">
          <span className="tabular">{countLabel}</span>
        </p>
        {bookGroupList.length > 0 && (
          <GroupFilter groups={bookGroupList} selected={activeGroup} onSelect={onGroupFilter} />
        )}
        <fieldset
          aria-label={t("sort_label")}
          className="m-0 hidden items-center gap-1 border-0 p-0 sm:inline-flex"
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

      {showIncompleteBook ? null : showEmptyBook ? (
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

function IncompleteBookWarning({
  count,
  retrying,
  onRetry,
}: {
  count: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const hadFocus = useRef(false);
  useEffect(() => {
    if (count === 0 && hadFocus.current) {
      document.getElementById("list")?.focus();
      hadFocus.current = false;
    }
  }, [count]);
  return (
    <div aria-live="polite" data-incomplete-book>
      {count > 0 && (
        <div
          role="status"
          aria-label={t("book_incomplete")}
          className="mx-2 mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm"
        >
          <p className="tabular flex gap-2 font-bold">
            <AlertIcon className="mt-0.5 size-4 text-warning" />
            {t(count === 1 ? "book_skipped_1" : "book_skipped_n", { n: String(count) })}
          </p>
          <p className="mt-1 text-muted-foreground">{t("book_incomplete_body")}</p>
          <button
            type="button"
            aria-disabled={retrying || undefined}
            onFocus={() => {
              hadFocus.current = true;
            }}
            onBlur={() => {
              hadFocus.current = false;
            }}
            onClick={() => {
              if (!retrying) onRetry();
            }}
            className={buttonClass({ variant: "outline", size: "sm" }, "mt-2")}
          >
            <RefreshIcon />
            {t(retrying ? "syncing" : "retry")}
          </button>
        </div>
      )}
    </div>
  );
}

function ListShell({
  children,
  warning,
  busy = false,
}: {
  children: ReactNode;
  warning: ReactNode;
  busy?: boolean;
}) {
  const { t } = useI18n();
  // From lg the list scrolls itself; its right margin keeps the scrollbar
  // clear of the rail, which sits outside it.
  return (
    <nav
      id="list"
      aria-label={t("list_label")}
      aria-busy={busy || undefined}
      tabIndex={-1}
      className="pb-24 pl-2 pr-7 lg:mr-8 lg:h-full lg:overflow-y-auto lg:pb-10 lg:pr-2"
    >
      {warning}
      {children}
    </nav>
  );
}

/** The sort toggle's pills: small to look at, a full row high to tap. */
const SORT_PILL = cn(
  "relative rounded-full px-2 py-0.5 font-bold text-muted-foreground transition-colors after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] aria-pressed:bg-secondary aria-pressed:text-foreground",
  FOCUS_RING,
);
