/**
 * AppHeader — brand band + bar (wordmark, book switcher, settings, new
 * contact, logout, xl-only sync status) + search row, per DESIGN.md "Header".
 *
 * `--header-h` (defined in src/index.css :root) is the mobile header height
 * used by sticky group letters (`top-[var(--header-h)]`): band 0.375rem +
 * 56px bar + search row = 7.375rem, at every phone width. On lg+ the header is
 * static (`lg:static`) and the letters use `lg:top-2`, so the property is
 * only meaningful below lg.
 */

import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import { isDesktop, isDialogOpen, isInMenu, isPlainKey, isTyping } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { DavAddressBook } from "@/queries";
import { BookSwitcher } from "./book-switcher";
import { DemoMark, DemoNotice } from "./demo-notice";
import { LogoutButton } from "./logout-button";

type AppHeaderProps = {
  books: DavAddressBook[] | undefined;
  selectedBook: DavAddressBook | null;
  onSelectBook: (book: DavAddressBook) => void;
  /** False while the selected book shows no contact. */
  canExport: boolean;
  /** False while the selected book is loading. */
  canImport: boolean;
  onExport: () => void;
  onImport: (file: File) => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** Contacts-query dataUpdatedAt (ms); 0 while nothing is loaded yet. */
  syncedAt: number;
  /** Hide the whole header on mobile while a contact fills the screen. */
  hiddenOnMobile: boolean;
};

export function AppHeader({
  books,
  selectedBook,
  onSelectBook,
  canExport,
  canImport,
  onExport,
  onImport,
  query,
  onQueryChange,
  syncedAt,
  hiddenOnMobile,
}: AppHeaderProps) {
  const { t } = useI18n();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Desktop only, like its kbd hint.
      if (
        event.key === "/" &&
        isPlainKey(event) &&
        !isTyping(event.target) &&
        !isInMenu(event.target) &&
        !isDialogOpen() &&
        isDesktop()
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function clearSearch() {
    onQueryChange("");
    searchRef.current?.focus();
  }

  return (
    <header
      id="app-header"
      className={cn(
        "sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:static",
        hiddenOnMobile && "max-lg:hidden",
      )}
    >
      <div className="h-1.5 bg-brand" aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-3 border-b px-4 lg:h-16 lg:flex-nowrap lg:gap-x-5 lg:px-6">
        {/* Zero basis: the book name truncates instead of pushing the actions
            onto a second row. */}
        <div className="order-1 flex h-14 min-w-30 flex-1 basis-0 items-center gap-2 lg:h-auto lg:flex-none lg:basis-auto lg:shrink-0">
          <span className="shrink-0 font-display text-[2rem] font-bold leading-none">Natel</span>
          <DemoMark />
          {books !== undefined && books.length > 0 && (
            <BookSwitcher
              books={books}
              selectedBook={selectedBook}
              onSelect={onSelectBook}
              canExport={canExport}
              canImport={canImport}
              onExport={onExport}
              onImport={onImport}
            />
          )}
        </div>

        <search className="order-3 w-full pb-3 lg:order-2 lg:w-auto lg:max-w-xl lg:flex-1 lg:pb-0">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted-foreground">
              <SearchIcon />
            </span>
            <input
              ref={searchRef}
              id="search"
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder={t("search_ph")}
              aria-label={t("search_label")}
              aria-controls="list"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  onQueryChange("");
                }
              }}
              className="block h-11 w-full rounded-full border border-input bg-background pl-10 pr-11 text-base text-foreground transition-colors placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:h-10 lg:text-[0.9375rem]"
            />
            <kbd
              hidden={query !== ""}
              className="pointer-events-none absolute inset-y-0 right-3 my-auto hidden h-6 items-center rounded-sm border bg-muted px-1.5 font-sans text-caption text-muted-foreground lg:inline-flex"
            >
              /
            </kbd>
            <button
              type="button"
              hidden={query === ""}
              aria-label={t("clear")}
              onClick={clearSearch}
              className="absolute inset-y-1 right-1 grid w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon />
            </button>
          </div>
        </search>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-2 lg:order-3 lg:gap-3">
          {syncedAt > 0 && <SyncStatus at={syncedAt} />}
          {/* A link, so an unsaved edit gets the discard dialog first. */}
          <Link
            to="/contacts/settings"
            aria-label={t("settings")}
            title={t("settings")}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <GearIcon />
          </Link>
          {books !== undefined && books.length > 0 && (
            <Link
              to="/contacts/new"
              aria-label={t("new_contact")}
              title={t("new_contact")}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <PlusIcon />
            </Link>
          )}
          <LogoutButton />
        </div>
      </div>
      <DemoNotice />
    </header>
  );
}

/**
 * Xl-only sync line, from the contacts query's dataUpdatedAt. Re-renders when
 * a focus refetch updates the timestamp, and once a minute so the label does
 * not go stale while the app stays open.
 */
function SyncStatus({ at }: { at: number }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  const label = minutes < 1 ? t("synced_just_now") : t("synced_ago", { n: String(minutes) });

  return (
    <p className="hidden items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground xl:inline-flex">
      <span className="text-success">
        <CheckIcon />
      </span>
      <span className="tabular">{label}</span>
    </p>
  );
}

function PlusIcon() {
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
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SearchIcon() {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function XIcon() {
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
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="size-3.5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function GearIcon() {
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
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
