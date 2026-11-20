/**
 * ContactList — the directory list pane: the toolbar (count, group filter,
 * sort menu), the letter sections (contact-row.tsx, or virtual-sections.tsx
 * for a large list) and the A–Z rail (alphabet-rail.tsx), hidden when the
 * list sorts by last modification. Group, letter, sort and search logic lives
 * in src/lib/contact-list.ts; this file only composes and styles it.
 */

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { useArrowNavigation } from "@/hooks/use-arrow-navigation";
import { useOpenRowInView } from "@/hooks/use-open-row-in-view";
import { useI18n } from "@/i18n/react";
import { bookGroups, contactsInGroup } from "@/lib/contact-groups";
import {
  buildGroups,
  LIST_SORTS,
  type ListSort,
  listSortOf,
  type SortBy,
} from "@/lib/contact-list";
import type { Contact } from "@/model/contact";
import { AlphabetRail } from "./alphabet-rail";
import { ChoiceMenu } from "./choice-menu";
import { GroupSection } from "./contact-row";
import { GroupFilter } from "./group-filter";
import { EmptyBook, ListSkeleton, SignInAgain, StateBox } from "./list-states";
import { buttonClass } from "./ui/button";
import { AlertIcon, RefreshIcon } from "./ui/icons";
import {
  type ContactListHandle,
  usePrinting,
  VIRTUAL_ABOVE,
  VirtualSections,
} from "./virtual-sections";

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
  /** Whether the list sorts by last modification rather than by `sortBy`. */
  byRevision: boolean;
  onListSort: (sort: ListSort) => void;
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
  byRevision,
  onListSort,
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
  const groups = useMemo(
    () => buildGroups(listed, sortBy, query, byRevision),
    [listed, sortBy, query, byRevision],
  );
  // A group gone from the book ends the filter, which doesn't come back with it.
  useEffect(() => {
    if (contacts !== undefined && groupFilter !== null && activeGroup === null) {
      onGroupFilter(null);
    }
  }, [contacts, groupFilter, activeGroup, onGroupFilter]);
  const listHandle = useRef<ContactListHandle | null>(null);
  useOpenRowInView(contacts !== undefined, listHandle);
  const shown = groups.reduce((total, group) => total + group.contacts.length, 0);
  const searching = query.trim().length > 0;
  useArrowNavigation(groups);
  const printing = usePrinting();
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
  if (contacts === undefined && load.kind === "failed") {
    return (
      <ListShell warning={warning}>
        {load.expired ? (
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

  // Loading keeps the toolbar and the rail: only the rows wait for the book.
  const loading = contacts === undefined;
  const count = contacts?.length ?? 0;
  const countLabel = loading
    ? t("loading_contacts")
    : searching
      ? shown === 0
        ? t("results_0")
        : shown === 1
          ? t("results_1")
          : t("results_n", { n: String(shown) })
      : activeGroup !== null
        ? listed.length === 1
          ? t("count_in_group_1", { group: activeGroup })
          : t("count_in_group", { n: String(listed.length), group: activeGroup })
        : count === 1
          ? t("count_1")
          : t("count", { n: String(count) });

  const showIncompleteBook = count === 0 && skippedCount > 0;
  const showEmptyBook = !searching && count === 0 && !showIncompleteBook;
  const showEmptyGroup = !searching && !showEmptyBook && listed.length === 0;
  const showNoResults = searching && shown === 0;
  const rail = byRevision ? null : (
    <AlphabetRail present={new Set(groups.map((g) => g.letter))} hidden={searching} />
  );

  return (
    <ListShell warning={warning} busy={loading}>
      {/* A sort that wraps stays on the right, under the group filter. */}
      <div className="relative flex flex-wrap items-center justify-end gap-x-3 gap-y-1 px-2 pb-1 pt-3 text-sm">
        <p className="mr-auto text-muted-foreground" aria-live="polite">
          <span className="tabular">{countLabel}</span>
        </p>
        {!loading && bookGroupList.length > 0 && (
          <GroupFilter groups={bookGroupList} selected={activeGroup} onSelect={onGroupFilter} />
        )}
        <SortMenu sort={listSortOf({ sortBy, byRevision })} onSort={onListSort} />
      </div>

      {loading ? (
        <>
          <ListSkeleton lettered={!byRevision} />
          {rail}
        </>
      ) : showIncompleteBook ? null : showEmptyBook ? (
        <EmptyBook onImport={onImport} />
      ) : showEmptyGroup ? (
        <StateBox title={t("group_empty")} />
      ) : showNoResults ? (
        <StateBox title={t("results_0")} hint={t("empty_hint")} />
      ) : (
        <>
          {shown > VIRTUAL_ABOVE && !printing ? (
            <VirtualSections groups={groups} query={query} sortBy={sortBy} handle={listHandle} />
          ) : (
            groups.map((group) => (
              <GroupSection key={group.letter} group={group} query={query} sortBy={sortBy} />
            ))
          )}
          {rail}
        </>
      )}
    </ListShell>
  );
}

function SortMenu({ sort, onSort }: { sort: ListSort; onSort: (sort: ListSort) => void }) {
  const { t } = useI18n();
  const choices = LIST_SORTS.map((value) => ({ value, label: t(`sort_${value}`) }));
  const current = choices.find((choice) => choice.value === sort)?.label ?? "";
  return (
    <ChoiceMenu
      id="sort-menu"
      label={t("sort_menu", { sort: current })}
      menuLabel={t("sort_label")}
      sections={[choices]}
      selected={sort}
      onSelect={onSort}
    />
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
