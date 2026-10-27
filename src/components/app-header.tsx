/**
 * AppHeader — bar (wordmark, book switcher, settings, new contact, and a
 * sync warning only when the book couldn't be reloaded) + search row, per
 * DESIGN.md "Header". Signing out is in the settings, so the bar keeps its
 * room for the book's name.
 *
 * The measured header height sets `--header-h` for mobile sticky letters.
 * Desktop letters use `lg:top-2`.
 */

import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/react";
import { isDesktop, isDialogOpen, isInMenu, isPlainKey, isTyping } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { DavAddressBook } from "@/queries";
import { BookSwitcher } from "./book-switcher";
import { DemoMark, DemoNotice } from "./demo-notice";
import { type SyncState, SyncWarning } from "./sync-warning";
import { buttonClass, FIELD_BUTTON_HIT_AREA } from "./ui/button";
import { GearIcon, PlusIcon, SearchIcon, XIcon } from "./ui/icons";
import { UpdateBadge, useUpdateBadge } from "./update-notice";

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
  /** How the last reload of the shown contacts went. */
  sync: SyncState;
  /** When the contacts shown were last loaded (ms). */
  syncedAt: number;
  onRetrySync: () => void;
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
  sync,
  syncedAt,
  onRetrySync,
  hiddenOnMobile,
}: AppHeaderProps) {
  const { t } = useI18n();
  const headerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLAnchorElement>(null);
  const updateBadge = useUpdateBadge();
  const settingsLabel = t(updateBadge ? "settings_update" : "settings");

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

  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const height = header.getBoundingClientRect().height;
      if (height > 0) document.documentElement.style.setProperty("--header-h", `${height}px`);
    });
    observer.observe(header);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--header-h");
    };
  }, []);

  function clearSearch() {
    onQueryChange("");
    searchRef.current?.focus();
  }

  return (
    <header
      ref={headerRef}
      id="app-header"
      className={cn(
        "sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:static",
        hiddenOnMobile && "max-lg:hidden",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 border-b px-4 lg:h-16 lg:flex-nowrap lg:gap-x-5 lg:px-6">
        {/* Zero basis: the book name truncates instead of pushing the actions
            onto a second row. */}
        <div className="order-1 flex h-14 min-w-30 flex-1 basis-0 items-center gap-2 lg:h-auto lg:flex-none lg:basis-auto lg:shrink-0">
          <span className="shrink-0 font-display text-wordmark font-bold">Natel</span>
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
              className="field block h-11 w-full rounded-full border border-input bg-background pl-10 pr-11 text-base text-foreground placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden lg:h-10 lg:text-body"
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
              className={buttonClass(
                { variant: "ghost", size: "icon-sm" },
                `absolute inset-y-0 right-1.5 my-auto size-8 ${FIELD_BUTTON_HIT_AREA} focus-visible:ring-offset-0`,
              )}
            >
              <XIcon />
            </button>
          </div>
        </search>

        <div className="order-2 ml-auto flex shrink-0 items-center gap-2 lg:order-3 lg:gap-3">
          <SyncWarning
            sync={sync}
            syncedAt={syncedAt}
            onRetry={onRetrySync}
            focusAfter={settingsRef}
          />
          {/* A link, so an unsaved edit gets the discard dialog first. */}
          <Link
            ref={settingsRef}
            to="/contacts/settings"
            aria-label={settingsLabel}
            title={settingsLabel}
            className={buttonClass({ variant: "ghost", size: "icon" }, "group relative")}
          >
            <GearIcon />
            {updateBadge && <UpdateBadge />}
          </Link>
          {books !== undefined && books.length > 0 && (
            // Round "+" on phones; labelled from lg, where there is room.
            <Link
              to="/contacts/new"
              aria-label={t("new_contact")}
              title={t("new_contact")}
              className={buttonClass({ size: "icon" }, "lg:w-auto lg:pl-3 lg:pr-4")}
            >
              <PlusIcon />
              <span className="hidden lg:inline" aria-hidden="true">
                {t("new_contact")}
              </span>
            </Link>
          )}
        </div>
      </div>
      <DemoNotice />
    </header>
  );
}
