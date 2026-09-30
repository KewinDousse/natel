/**
 * MoveDialog — picks the book a contact moves to (ADR 021). Built like the
 * delete dialog: the other books as native radio buttons, none chosen at
 * first, "Déplacer" disabled until one is. While the move runs nothing in it
 * responds, so a second click can't start another create.
 */

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/i18n/react";
import { bookName } from "@/lib/vcf-file";
import type { DavAddressBook } from "@/queries";

export function MoveDialog({
  books,
  running,
  spinner,
  onCancel,
  onMove,
}: {
  /** The books the contact can go to: every book but its own. */
  books: DavAddressBook[];
  running: boolean;
  spinner: ReactNode;
  onCancel: () => void;
  onMove: (book: DavAddressBook) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const target = books.find((book) => book.href === chosen);

  useEffect(() => {
    const previous = document.activeElement;
    firstRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  // While the move runs every control is disabled; the panel keeps the focus.
  useEffect(() => {
    if (running) panelRef.current?.focus();
  }, [running]);

  // Tab cycles inside the dialog: from the last enabled button back to the
  // radio group, whose tab stop is the checked radio (or the first one), and
  // the other way round.
  const trapTab = (event: ReactKeyboardEvent) => {
    if (event.key !== "Tab") return;
    if (running) {
      event.preventDefault();
      return;
    }
    const radios = panelRef.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    const group = Array.from(radios ?? []);
    const stop = group.find((radio) => radio.checked) ?? group[0];
    const last = target ? moveRef.current : cancelRef.current;
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      stop?.focus();
    } else if (event.shiftKey && document.activeElement === stop) {
      event.preventDefault();
      last?.focus();
    }
  };

  return (
    <div
      onClick={(event) => {
        if (!running && event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={trapTab}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={running}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center dark:bg-black/60"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="document"
        className="w-full max-w-md rounded-t-xl bg-background p-6 shadow-overlay focus:outline-none sm:rounded-xl"
      >
        <h2 id={titleId} className="font-display text-2xl font-bold leading-tight">
          {t("move_title")}
        </h2>
        <fieldset disabled={running} className="mt-4 space-y-1 border-0 p-0">
          <legend className="sr-only">{t("move_to")}</legend>
          {books.map((book, index) => (
            <label
              key={book.href}
              className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm font-bold hover:bg-muted"
            >
              <input
                ref={index === 0 ? firstRef : undefined}
                type="radio"
                name="move-target"
                value={book.href}
                checked={chosen === book.href}
                onChange={() => setChosen(book.href)}
                className="size-4 accent-primary"
              />
              <span className="truncate">{bookName(book)}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={running}
            className="inline-flex h-10 items-center justify-center rounded-full border border-input bg-background px-4 text-sm font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            ref={moveRef}
            type="button"
            onClick={() => target && onMove(target)}
            disabled={!target || running}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {running ? (
              <>
                {spinner}
                {t("moving")}
              </>
            ) : (
              t("move_confirm")
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
