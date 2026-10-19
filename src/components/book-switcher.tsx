/**
 * BookSwitcher — pill with the current address book's name + chevron; opens a
 * hand-built menu listing the books. The shadcn CLI's base-nova style emits
 * non-stack dependencies, so this is a plain menu-button pattern: Escape
 * closes and restores focus to the trigger, arrow keys move between items,
 * the current book is marked with aria-checked (menuitemradio), and clicking
 * outside closes the menu. Below a separator, the menu exports the selected
 * book and imports a .vcf file into it (ADR 020).
 */

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { bookName } from "@/lib/vcf-file";
import type { DavAddressBook } from "@/queries";
import { FOCUS_RING } from "./ui/button";
import { CheckIcon, ChevronDownIcon, DownloadIcon, UploadIcon } from "./ui/icons";

type BookSwitcherProps = {
  books: DavAddressBook[];
  selectedBook: DavAddressBook | null;
  onSelect: (book: DavAddressBook) => void;
  /** False while the selected book shows no contact. */
  canExport: boolean;
  /** False while the selected book is loading: known cards couldn't be told apart. */
  canImport: boolean;
  onExport: () => void;
  onImport: (file: File) => void;
};

// A disabled item stays focusable, as the ARIA menu pattern has it.
const ITEMS = '[role="menuitemradio"], [role="menuitem"]';

export function BookSwitcher({
  books,
  selectedBook,
  onSelect,
  canExport,
  canImport,
  onExport,
  onImport,
}: BookSwitcherProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentIndex = useMemo(() => {
    if (!selectedBook) return 0;
    const index = books.findIndex((book) => book.href === selectedBook.href);
    return index === -1 ? 0 : index;
  }, [books, selectedBook]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  /** Give the menu keyboard focus on the current book when it opens. */
  useEffect(() => {
    if (!open) return;
    setFocusedIndex(currentIndex);
    const items = rootRef.current?.querySelectorAll<HTMLButtonElement>(ITEMS);
    items?.[currentIndex]?.focus();
  }, [open, currentIndex]);

  function menuItems(): HTMLButtonElement[] {
    if (!rootRef.current) return [];
    return Array.from(rootRef.current.querySelectorAll<HTMLButtonElement>(ITEMS));
  }

  function moveFocus(delta: number) {
    const items = menuItems();
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = ((at === -1 ? focusedIndex : at) + delta + items.length) % items.length;
    setFocusedIndex(next);
    items[next]?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setFocusedIndex(0);
      menuItems()[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      const items = menuItems();
      const last = items.length - 1;
      setFocusedIndex(last);
      items[last]?.focus();
    } else if (event.key === "Tab") {
      close(); // let the browser move focus along naturally
    }
  }

  /** Close on outside clicks; the trigger's own click toggles instead. */
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (rootRef.current && !rootRef.current.contains(target)) close();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  // On phones the menu spans the sticky header, not the trigger: a long book
  // name would otherwise push it off the screen.
  return (
    <div ref={rootRef} className="min-w-10 sm:relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="book-menu"
        // The book's name is the visible label, so it is in the accessible one.
        aria-label={t("book_label_current", { name: selectedBook ? bookName(selectedBook) : "" })}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (!open && event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "inline-flex h-8 min-w-0 max-w-full items-center gap-1 rounded-full px-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          FOCUS_RING,
        )}
      >
        <span className="truncate">{selectedBook?.displayName ?? ""}</span>
        <ChevronDownIcon
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          id="book-menu"
          role="menu"
          aria-label={t("book_label")}
          onKeyDown={onMenuKeyDown}
          className="absolute inset-x-4 top-[calc(0.375rem+3.5rem)] z-30 rounded-lg bg-popover py-1 shadow-float sm:inset-x-auto sm:left-0 sm:top-[calc(100%+0.375rem)] sm:min-w-[13rem]"
        >
          {books.map((book, index) => {
            const checked = book.href === selectedBook?.href;
            return (
              <div key={book.href} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  tabIndex={index === focusedIndex ? 0 : -1}
                  onMouseEnter={() => setFocusedIndex(index)}
                  onClick={() => {
                    onSelect(book);
                    close();
                  }}
                  className="flex h-10 w-full items-center gap-2 rounded-sm px-3 text-left text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="truncate">{book.displayName || book.href}</span>
                  {checked && (
                    <span className="ml-auto shrink-0 text-success" aria-hidden="true">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              </div>
            );
          })}
          <hr className="my-1 border-t" />
          <div role="none">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={!canExport}
              onClick={() => {
                if (!canExport) return;
                close();
                onExport();
              }}
              className="flex h-10 w-full items-center gap-2 rounded-sm px-3 text-left text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground aria-disabled:hover:bg-transparent"
            >
              <DownloadIcon className="size-4 text-muted-foreground" />
              <span className="truncate">
                {t("menu_export", { name: selectedBook ? bookName(selectedBook) : "" })}
              </span>
            </button>
          </div>
          <div role="none">
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={!canImport}
              onClick={() => {
                if (!canImport) return;
                // Opened inside the click, which browsers require of a file picker.
                fileRef.current?.click();
                close();
              }}
              className="flex h-10 w-full items-center gap-2 rounded-sm px-3 text-left text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground aria-disabled:hover:bg-transparent"
            >
              <UploadIcon className="size-4 text-muted-foreground" />
              <span className="truncate">{t("menu_import")}</span>
            </button>
          </div>
        </div>
      )}
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
    </div>
  );
}
