/**
 * BookSwitcher — pill with the current address book's name + chevron; opens a
 * hand-built menu listing the books. The shadcn CLI's base-nova style emits
 * non-stack dependencies, so this is a plain menu-button pattern: Escape
 * closes and restores focus to the trigger, arrow keys move between items,
 * the current book is marked with aria-checked (menuitemradio), and clicking
 * outside closes the menu.
 */

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import type { DavAddressBook } from "@/queries";

type BookSwitcherProps = {
  books: DavAddressBook[];
  selectedBook: DavAddressBook | null;
  onSelect: (book: DavAddressBook) => void;
};

export function BookSwitcher({ books, selectedBook, onSelect }: BookSwitcherProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
    const items = rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    items?.[currentIndex]?.focus();
  }, [open, currentIndex]);

  function menuItems(): HTMLButtonElement[] {
    if (!rootRef.current) return [];
    return Array.from(
      rootRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    );
  }

  function moveFocus(delta: number) {
    const items = menuItems();
    if (items.length === 0) return;
    const next = (focusedIndex + delta + items.length) % items.length;
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
        aria-label={t("book_label")}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (!open && event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex h-8 min-w-0 max-w-full items-center gap-1 rounded-full px-2.5 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
        </div>
      )}
    </div>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
