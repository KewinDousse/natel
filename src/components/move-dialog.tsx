/**
 * MoveDialog — picks the book a contact moves to (ADR 021). Built like the
 * delete dialog: the other books as native radio buttons, none chosen at
 * first unless there is only one, "Déplacer" disabled until one is. While the
 * move runs nothing in it responds, so a second click can't start another
 * create.
 */

import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import { bookName } from "@/lib/vcf-file";
import type { DavAddressBook } from "@/queries";
import { buttonClass } from "./ui/button";
import { Dialog, DialogActions, DialogTitle } from "./ui/dialog";

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
  const [chosen, setChosen] = useState<string | null>(
    books.length === 1 ? (books[0]?.href ?? null) : null,
  );
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

  // Nothing responds while the move runs, the keyboard included.
  const keepFocus = (event: KeyboardEvent) => {
    if (running && event.key === "Tab") event.preventDefault();
  };

  return (
    <Dialog
      titleId={titleId}
      panelRef={panelRef}
      busy={running}
      onDismiss={onCancel}
      onKeyDown={keepFocus}
    >
      <DialogTitle id={titleId}>{t("move_title")}</DialogTitle>
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
      <DialogActions>
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          disabled={running}
          className={buttonClass({ variant: "outline" })}
        >
          {t("cancel")}
        </button>
        <button
          ref={moveRef}
          type="button"
          onClick={() => target && onMove(target)}
          disabled={!target || running}
          className={buttonClass()}
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
      </DialogActions>
    </Dialog>
  );
}
