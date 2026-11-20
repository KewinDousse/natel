import type { CSSProperties, PointerEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/react";
import { RAIL_LETTERS, railIndexAt, railSlots, railTarget } from "@/lib/contact-list";

// The slots share the rail's height (min-h-0 lets a cell shrink below its
// text), and each letter takes three quarters of its slot.
const CELL =
  "grid min-h-0 max-h-8 flex-1 place-items-center rounded-sm text-[length:min(100cqh/var(--rail-slots)*0.75,1rem)]";
const PRESENT = `${CELL} text-foreground transition-colors hover:text-brand`;
const ABSENT = `${CELL} pointer-events-none text-leader`;

/**
 * A–Z and # rail — absent entries are aria-hidden and out of the tab order; anchors
 * jump without smooth scrolling. Hidden entirely while a search is active.
 * On a short screen it shows some letters with a dot between two, as iOS does.
 * On touch, a tap or a finger sliding along the rail scrolls to the letter
 * under it, as native contact apps do, hidden letters included; the anchors
 * serve mouse and keyboard.
 */
export function AlphabetRail({ present, hidden }: { present: Set<string>; hidden: boolean }) {
  const { t } = useI18n();
  const nav = useRef<HTMLElement>(null);
  const shown = useRef<string | null>(null);
  const touched = useRef(false);
  // Unmeasured (no ResizeObserver, as in jsdom), the rail shows every letter.
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const rail = nav.current;
    if (!rail || typeof ResizeObserver === "undefined") return;
    const measure = () => setHeight(rail.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);

  const slots = height === null ? RAIL_LETTERS : railSlots(height);

  // A dot's slot stands for the letters a short rail hides, so a finger still
  // reaches all 27.
  function jumpTo(event: PointerEvent<HTMLElement>) {
    const first = event.currentTarget.firstElementChild?.getBoundingClientRect();
    const last = event.currentTarget.lastElementChild?.getBoundingClientRect();
    if (!first || !last || last.bottom <= first.top) return;
    const index = railIndexAt(slots, (event.clientY - first.top) / (last.bottom - first.top));
    if (index === undefined) return;
    const target = railTarget(RAIL_LETTERS, present, index);
    if (!target || target === shown.current) return;
    shown.current = target;
    document.getElementById(`g-${target}`)?.scrollIntoView();
  }

  return (
    <nav
      ref={nav}
      id="rail"
      hidden={hidden}
      // With no letter to jump to, the index is only a visual placeholder.
      aria-hidden={present.size === 0 || undefined}
      aria-label={t("index_label")}
      onPointerDown={(event) => {
        touched.current = event.pointerType !== "mouse";
        if (!touched.current) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        shown.current = null;
        jumpTo(event);
      }}
      // The browser retargets a tap's click to the nearest anchor, which would
      // override the finger's letter (a dot's hidden letter, say).
      onClick={(event) => {
        if (touched.current) event.preventDefault();
        touched.current = false;
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) jumpTo(event);
      }}
      style={{ "--rail-slots": slots.length } as CSSProperties}
      className="fixed bottom-6 right-0.5 top-[calc(var(--header-h)+0.875rem)] z-10 flex touch-none select-none flex-col [-webkit-touch-callout:none] @container-size w-5 justify-center font-display font-bold leading-none lg:absolute lg:bottom-4 lg:right-1.5 lg:top-4"
    >
      {slots.map((letter, slot) => {
        if (letter === null) {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: a dot is only its place between two letters.
            <span key={`dot-${slot}`} aria-hidden="true" className={ABSENT}>
              •
            </span>
          );
        }
        if (present.has(letter)) {
          return (
            <a key={letter} href={`#g-${letter}`} data-letter={letter} className={PRESENT}>
              {letter}
            </a>
          );
        }
        // Absent letters are not navigable: a span, hidden from assistive tech.
        return (
          <span key={letter} data-letter={letter} aria-hidden="true" className={ABSENT}>
            {letter}
          </span>
        );
      })}
    </nav>
  );
}
