/**
 * ChoiceMenu — the list toolbar's menu pill, behind the group filter and the
 * sort (DESIGN.md "List toolbar"), built like the book switcher's menu.
 * Escape closes and restores focus to the trigger, arrow keys move between
 * items, the chosen entry is marked with aria-checked (menuitemradio), and
 * clicking outside closes the menu. With `clear`, the pill fills and a ×
 * undoes the choice.
 */

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./ui/button";
import { CheckIcon, ChevronDownIcon, XSmallIcon } from "./ui/icons";

export type Choice<T> = { value: T; label: string; count?: number };

type ChoiceMenuProps<T> = {
  id: string;
  /** The trigger's text. */
  label: string;
  /** The trigger's accessible name, when it says more than `label`. */
  triggerLabel?: string;
  menuLabel: string;
  /** The choices, a separator between sections; labels are unique within one. */
  sections: Choice<T>[][];
  selected: T;
  onSelect: (value: T) => void;
  clear?: { label: string; onClear: () => void };
};

const ITEMS = '[role="menuitemradio"]';

export function ChoiceMenu<T>({
  id,
  label,
  triggerLabel,
  menuLabel,
  sections,
  selected,
  onSelect,
  clear,
}: ChoiceMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const choices = sections.flat();
  const currentIndex = Math.max(
    0,
    choices.findIndex((choice) => choice.value === selected),
  );

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    setFocusedIndex(currentIndex);
    rootRef.current?.querySelectorAll<HTMLButtonElement>(ITEMS)[currentIndex]?.focus();
  }, [open, currentIndex]);

  function menuItems(): HTMLButtonElement[] {
    if (!rootRef.current) return [];
    return Array.from(rootRef.current.querySelectorAll<HTMLButtonElement>(ITEMS));
  }

  function focusItem(index: number) {
    const items = menuItems();
    if (items.length === 0) return;
    const next = (index + items.length) % items.length;
    setFocusedIndex(next);
    items[next]?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const at = menuItems().indexOf(document.activeElement as HTMLButtonElement);
    const from = at === -1 ? focusedIndex : at;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(from + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(from - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusItem(-1);
    } else if (event.key === "Tab") {
      close();
    }
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (rootRef.current && !rootRef.current.contains(target)) close();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, close]);

  function choose(value: T) {
    onSelect(value);
    close();
  }

  const item = (choice: Choice<T>, index: number) => {
    const checked = choice.value === selected;
    return (
      <div key={choice.label} role="none">
        <button
          type="button"
          role="menuitemradio"
          aria-checked={checked}
          tabIndex={index === focusedIndex ? 0 : -1}
          onMouseEnter={() => setFocusedIndex(index)}
          onClick={() => choose(choice.value)}
          className="flex h-10 w-full items-center gap-2 rounded-sm px-3 text-left text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        >
          <span className="truncate">{choice.label}</span>
          {checked ? (
            <span className="ml-auto shrink-0 text-success" aria-hidden="true">
              <CheckIcon />
            </span>
          ) : (
            choice.count !== undefined && (
              <span className="ml-auto shrink-0 text-sm font-normal text-muted-foreground tabular">
                {choice.count}
              </span>
            )
          )}
        </button>
      </div>
    );
  };

  return (
    // On phones the menu spans the toolbar, which positions it.
    <div ref={rootRef} className="min-w-0 sm:relative">
      <div
        className={cn(
          "inline-flex h-8 max-w-full items-center rounded-full",
          clear && "bg-secondary pr-1",
        )}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={id}
          aria-label={triggerLabel}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={(event) => {
            if (!open && event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            "inline-flex h-8 min-w-0 max-w-full items-center gap-1 rounded-full px-2.5 text-sm font-bold transition-colors",
            FOCUS_RING,
            clear
              ? "pl-3 pr-1 text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <span className="truncate">{label}</span>
          {!clear && (
            <ChevronDownIcon
              className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
            />
          )}
        </button>
        {clear && (
          <button
            type="button"
            aria-label={clear.label}
            onClick={() => {
              clear.onClear();
              // The × goes with the choice: the focus stays on the trigger.
              triggerRef.current?.focus();
            }}
            className={cn(
              "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:bg-muted hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <XSmallIcon />
          </button>
        )}
      </div>

      {open && (
        <div
          id={id}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKeyDown}
          className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-30 max-h-[60vh] overflow-y-auto rounded-lg bg-popover py-1 shadow-float sm:inset-x-auto sm:right-0 sm:min-w-[13rem]"
        >
          {sections.map((section, at) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a menu's sections are fixed, in order.
            <div key={at} role="none">
              {at > 0 && <hr className="my-1 border-t" />}
              {section.map((choice) => item(choice, choices.indexOf(choice)))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
