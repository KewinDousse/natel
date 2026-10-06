/**
 * GroupFilter — the list's group filter (DESIGN.md "Group filter", ADR 022): a
 * pill opening a menu of the book's groups, built like the book switcher's.
 * Escape closes and restores focus to the trigger, arrow keys move between
 * items, the chosen entry is marked with aria-checked (menuitemradio), and
 * clicking outside closes the menu. Once filtered, the pill names the group
 * and a × goes back to every group.
 */

import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import type { BookGroup } from "@/lib/contact-groups";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./button";
import { CheckIcon, ChevronDownIcon, XSmallIcon } from "./icons";

type GroupFilterProps = {
  groups: BookGroup[];
  /** The group shown, or null for every contact. */
  selected: string | null;
  onSelect: (name: string | null) => void;
  className?: string;
};

const ITEMS = '[role="menuitemradio"]';

export function GroupFilter({ groups, selected, onSelect, className }: GroupFilterProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // "Tous les groupes" comes first, then each group in order.
  const currentIndex =
    selected === null ? 0 : groups.findIndex((group) => group.name === selected) + 1;

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

  function choose(name: string | null) {
    onSelect(name);
    close();
  }

  const label = selected ?? t("group_all");
  const item = (name: string | null, index: number, count?: number) => {
    const checked = name === selected;
    return (
      <div key={name ?? ""} role="none">
        <button
          type="button"
          role="menuitemradio"
          aria-checked={checked}
          tabIndex={index === focusedIndex ? 0 : -1}
          onMouseEnter={() => setFocusedIndex(index)}
          onClick={() => choose(name)}
          className="flex h-10 w-full items-center gap-2 rounded-sm px-3 text-left text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        >
          <span className="truncate">{name ?? t("group_all")}</span>
          {checked ? (
            <span className="ml-auto shrink-0 text-success" aria-hidden="true">
              <CheckIcon />
            </span>
          ) : (
            count !== undefined && (
              <span className="ml-auto shrink-0 text-sm font-normal text-muted-foreground tabular">
                {count}
              </span>
            )
          )}
        </button>
      </div>
    );
  };

  return (
    // On its own row on phones, the unfiltered label lines up with the count.
    <div
      ref={rootRef}
      className={cn("relative min-w-0", selected === null && "max-sm:-ml-2.5", className)}
    >
      <div
        className={cn(
          "inline-flex h-8 max-w-full items-center rounded-full",
          selected !== null && "bg-secondary pr-1",
        )}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="group-menu"
          aria-label={t("group_filter_label", { name: label })}
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
            selected === null
              ? "text-muted-foreground hover:bg-muted hover:text-foreground"
              : "pl-3 pr-1 text-foreground",
          )}
        >
          <span className="truncate">{label}</span>
          {selected === null && (
            <ChevronDownIcon
              className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
            />
          )}
        </button>
        {selected !== null && (
          <button
            type="button"
            aria-label={t("group_filter_clear")}
            onClick={() => {
              onSelect(null);
              // The × goes with the filter: the focus stays on the trigger.
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
          id="group-menu"
          role="menu"
          aria-label={t("group_filter_menu")}
          onKeyDown={onMenuKeyDown}
          className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-30 max-h-[60vh] overflow-y-auto rounded-lg bg-popover py-1 shadow-float sm:inset-x-auto sm:right-0 sm:min-w-[13rem]"
        >
          {item(null, 0)}
          <hr className="my-1 border-t" />
          {groups.map((group, index) => item(group.name, index + 1, group.count))}
        </div>
      )}
    </div>
  );
}
