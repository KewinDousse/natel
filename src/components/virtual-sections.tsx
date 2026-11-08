/**
 * The list's letter sections for a large list, with only the rows near the
 * viewport mounted. Every section stays in the DOM at its full height, so the
 * sticky letters and the rail's anchors keep working natively; only the rows
 * are virtual.
 */

import {
  defaultRangeExtractor,
  measureElement,
  type Range,
  useVirtualizer,
  useWindowVirtualizer,
  type Virtualizer,
} from "@tanstack/react-virtual";
import type { FocusEvent, RefObject } from "react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { type ContactGroup, contactIdOf, type SortBy } from "@/lib/contact-list";
import { isDesktop } from "@/lib/shortcuts";
import type { Contact } from "@/model/contact";
import { useBookParam } from "@/store/session";
import { ContactRow, SectionFrame } from "./contact-row";

/**
 * Up to this many rows, the list mounts them all, which keeps the browser's
 * find in page and a screen reader's view of every row.
 */
export const VIRTUAL_ABOVE = 1000;

/** Brings a contact's row into view, mounting it if needed. */
export type ContactListHandle = { reveal: (contactId: string) => void };

type Slot =
  | { kind: "gap"; size: number; key: string }
  | { kind: "row"; contact: Contact; key: string };

// Each section's `border-t py-2`, modelled as an item before its rows so that
// offsets match the page without mounting anything.
const SECTION_PADDING = 8;
const SECTION_BORDER = 1;
const OVERSCAN = 10;

/** The virtualizer's items, in order, and where each section starts among them. */
function slotsOf(groups: ContactGroup[]): { slots: Slot[]; gapIndexes: number[] } {
  const slots: Slot[] = [];
  const gapIndexes: number[] = [];
  groups.forEach((group, groupIndex) => {
    gapIndexes.push(slots.length);
    slots.push({
      kind: "gap",
      key: `gap-${group.letter}`,
      // Between two sections, the bottom padding of the one before comes too.
      size: SECTION_BORDER + SECTION_PADDING + (groupIndex === 0 ? 0 : SECTION_PADDING),
    });
    for (const contact of group.contacts) {
      slots.push({ kind: "row", contact, key: contact.href });
    }
  });
  return { slots, gapIndexes };
}

/**
 * True while the page prints. The print shows only what is mounted, so the
 * list mounts every row for it.
 */
export function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    // The rows must be in the DOM before the browser lays out the print.
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  return printing;
}

type SectionsProps = {
  groups: ContactGroup[];
  query: string;
  sortBy: SortBy;
  handle: RefObject<ContactListHandle | null>;
};

export function VirtualSections(props: SectionsProps) {
  const [desktop, setDesktop] = useState(isDesktop);
  // The first row in view, kept across the switch between the two scrollers.
  const inView = useRef<string | null>(null);
  const restore = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 64rem)");
    const onChange = () => {
      restore.current = inView.current;
      setDesktop(media.matches);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const anchor = useMemo(() => ({ inView, restore }), []);
  // From lg the list scrolls itself; below, the page does.
  return desktop ? (
    <PaneSections {...props} anchor={anchor} />
  ) : (
    <PageSections {...props} anchor={anchor} />
  );
}

type Anchor = {
  inView: RefObject<string | null>;
  restore: RefObject<string | null>;
};

/** The rows' `min-h`, which follows the browser's font size and the `sm` breakpoint. */
function rowSizeNow(): number {
  const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return (window.matchMedia?.("(min-width: 40rem)").matches ? 3.25 : 3.5) * rem;
}

/** Whether the element is laid out, which the browsers without `checkVisibility` assume. */
function isShown(element: HTMLElement | null): boolean {
  return (
    element !== null && (typeof element.checkVisibility !== "function" || element.checkVisibility())
  );
}

/** What the sticky header covers of the page on phones. */
function headerHeight(): number {
  return document.getElementById("app-header")?.offsetHeight ?? 0;
}

function useSlotOptions(groups: ContactGroup[]) {
  const model = useMemo(() => slotsOf(groups), [groups]);
  const { slots } = model;
  const [rowSize, setRowSize] = useState(rowSizeNow);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 40rem)");
    const onChange = () => setRowSize(rowSizeNow());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const estimateSize = useCallback(
    (index: number) => {
      const slot = slots[index];
      return slot?.kind === "gap" ? slot.size : rowSize;
    },
    [slots, rowSize],
  );
  const getItemKey = useCallback((index: number) => slots[index]?.key ?? index, [slots]);
  // A mounted row hidden with the list (a contact open on a phone) measures 0.
  const measure = useCallback(
    (
      element: HTMLLIElement,
      entry: ResizeObserverEntry | undefined,
      instance: Parameters<typeof measureElement<HTMLLIElement>>[2],
    ) => {
      const size = measureElement(element, entry, instance);
      return size > 0 ? size : estimateSize(instance.indexFromElement(element));
    },
    [estimateSize],
  );
  // A focused row stays mounted, so scrolling away doesn't drop the focus.
  const focused = useRef<string | null>(null);
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (focused.current === null) return indexes;
      const at = slots.findIndex((slot) => slot.key === focused.current);
      return at === -1 || indexes.includes(at) ? indexes : [...indexes, at].sort((a, b) => a - b);
    },
    [slots],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  return {
    model,
    rowSize,
    estimateSize,
    getItemKey,
    measure,
    focused,
    rangeExtractor,
    containerRef,
    scrollMargin,
    setScrollMargin,
  };
}

function PaneSections(props: SectionsProps & { anchor: Anchor }) {
  const slot = useSlotOptions(props.groups);
  const virtualizer = useVirtualizer<HTMLElement, HTMLLIElement>({
    count: slot.model.slots.length,
    getScrollElement: () => document.getElementById("list"),
    estimateSize: slot.estimateSize,
    getItemKey: slot.getItemKey,
    measureElement: slot.measure,
    rangeExtractor: slot.rangeExtractor,
    overscan: OVERSCAN,
    scrollMargin: slot.scrollMargin,
    initialRect: { width: 0, height: window.innerHeight },
    paddingEnd: SECTION_PADDING,
  });
  return (
    <Sections
      {...props}
      desktop
      virtualizer={virtualizer}
      slot={slot}
      marginOf={(top) => {
        const pane = document.getElementById("list");
        return pane ? top - pane.getBoundingClientRect().top + pane.scrollTop : 0;
      }}
    />
  );
}

function PageSections(props: SectionsProps & { anchor: Anchor }) {
  const slot = useSlotOptions(props.groups);
  const virtualizer = useWindowVirtualizer<HTMLLIElement>({
    count: slot.model.slots.length,
    estimateSize: slot.estimateSize,
    getItemKey: slot.getItemKey,
    measureElement: slot.measure,
    rangeExtractor: slot.rangeExtractor,
    overscan: OVERSCAN,
    scrollMargin: slot.scrollMargin,
    // A row scrolled to lands below the sticky header.
    scrollPaddingStart: headerHeight(),
    initialRect: { width: 0, height: window.innerHeight },
    paddingEnd: SECTION_PADDING,
  });
  return (
    <Sections
      {...props}
      desktop={false}
      virtualizer={virtualizer}
      slot={slot}
      marginOf={(top) => top + window.scrollY}
    />
  );
}

function Sections({
  groups,
  query,
  sortBy,
  handle,
  anchor,
  desktop,
  virtualizer,
  slot,
  marginOf,
}: SectionsProps & {
  anchor: Anchor;
  desktop: boolean;
  virtualizer: Virtualizer<HTMLElement, HTMLLIElement> | Virtualizer<Window, HTMLLIElement>;
  slot: ReturnType<typeof useSlotOptions>;
  marginOf: (top: number) => number;
}) {
  const book = useBookParam();
  const { model, containerRef, focused, setScrollMargin, scrollMargin } = slot;
  const { slots, gapIndexes } = model;

  const latestMarginOf = useRef(marginOf);
  latestMarginOf.current = marginOf;
  // What sits above the rows (warning, toolbar, header on phones) can change height.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const rect = container.getBoundingClientRect();
      // A list hidden with `display: none` has no position to read.
      if (rect.height > 0) setScrollMargin(latestMarginOf.current(rect.top));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    const header = document.getElementById("app-header");
    if (header) observer.observe(header);
    for (
      let above = container.previousElementSibling;
      above;
      above = above.previousElementSibling
    ) {
      observer.observe(above);
    }
    return () => observer.disconnect();
  }, [containerRef, setScrollMargin]);

  // Unmeasured rows take the new estimate.
  const { rowSize } = slot;
  const sizedFor = useRef(rowSize);
  useEffect(() => {
    if (sizedFor.current === rowSize) return;
    sizedFor.current = rowSize;
    virtualizer.measure();
  }, [rowSize, virtualizer]);

  const indexOf = useCallback(
    (contactId: string) =>
      slots.findIndex(
        (candidate) => candidate.kind === "row" && contactIdOf(candidate.contact) === contactId,
      ),
    [slots],
  );

  useImperativeHandle(
    handle,
    () => ({
      reveal: (contactId) => {
        // On a phone, an open contact hides the list and the page scrolls the contact.
        if (!isShown(containerRef.current)) return;
        const index = indexOf(contactId);
        if (index !== -1) virtualizer.scrollToIndex(index, { align: "auto" });
      },
    }),
    [containerRef, indexOf, virtualizer],
  );

  // Back on the row that was first in view before the other scroller took
  // over, once the list is shown: a contact open on a phone hides it, and the
  // page then scrolls the contact.
  const restoring = useRef<number | null>(null);
  useEffect(() => {
    const key = anchor.restore.current;
    if (key === null || restoring.current !== null || !isShown(containerRef.current)) return;
    restoring.current = requestAnimationFrame(() => {
      restoring.current = null;
      anchor.restore.current = null;
      const index = slots.findIndex((candidate) => candidate.key === key);
      if (index !== -1) virtualizer.scrollToIndex(index, { align: "start" });
    });
  });
  useEffect(
    () => () => {
      if (restoring.current !== null) cancelAnimationFrame(restoring.current);
    },
    [],
  );

  useEffect(() => {
    // Once the layout has switched, this scroller has lost its position, and a
    // hidden list has none.
    if (isDesktop() !== desktop || !isShown(containerRef.current)) return;
    const covered = (virtualizer.scrollOffset ?? 0) + (desktop ? 0 : headerHeight());
    const first = virtualizer
      .getVirtualItems()
      .find((item) => item.end > covered && slots[item.index]?.kind === "row");
    anchor.inView.current = first === undefined ? null : (slots[first.index]?.key ?? null);
  });

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const row = event.target.closest("li");
    const index = row === null ? Number.NaN : Number(row.dataset.index);
    const candidate = slots[index];
    focused.current = candidate?.kind === "row" ? candidate.key : null;
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) focused.current = null;
  };

  // The list only has contacts once a book is selected.
  if (book === undefined) return null;
  const mounted = virtualizer.getVirtualItems();
  const measurements = virtualizer.measurementsCache;
  let cursor = 0;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: focus bubbling up from the rows, nothing interactive here
    <div ref={containerRef} onFocus={onFocus} onBlur={onBlur}>
      {groups.map((group, groupIndex) => {
        const gapIndex = gapIndexes[groupIndex] ?? 0;
        const lastIndex = gapIndex + group.contacts.length;
        const origin = measurements[gapIndex]?.end ?? scrollMargin;
        const end = measurements[lastIndex]?.end ?? origin;
        const rows = [];
        for (; cursor < mounted.length; cursor++) {
          const item = mounted[cursor];
          if (item === undefined || item.index > lastIndex) break;
          const candidate = slots[item.index];
          if (candidate?.kind !== "row") continue;
          rows.push(
            <li
              key={candidate.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              aria-posinset={item.index - gapIndex}
              aria-setsize={group.contacts.length}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${item.start - origin}px)` }}
            >
              <ContactRow book={book} contact={candidate.contact} query={query} sortBy={sortBy} />
            </li>,
          );
        }
        return (
          <SectionFrame key={group.letter} letter={group.letter}>
            {/* biome-ignore lint/a11y/noRedundantRoles: DESIGN.md mandates <ul role="list"> */}
            <ul role="list" className="relative min-w-0" style={{ height: end - origin }}>
              {rows}
            </ul>
          </SectionFrame>
        );
      })}
    </div>
  );
}
