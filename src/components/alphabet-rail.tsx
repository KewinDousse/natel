import type { PointerEvent } from "react";
import { useRef } from "react";
import { useI18n } from "@/i18n/react";
import { ALPHABET, railTarget } from "@/lib/contact-list";

/**
 * A–Z rail — absent letters are aria-hidden and out of the tab order; anchors
 * jump without smooth scrolling. Hidden entirely while a search is active.
 * On touch, a tap or a finger sliding along the rail scrolls to the letter
 * under it, as native contact apps do; the anchors serve mouse and keyboard.
 */
export function AlphabetRail({ present, hidden }: { present: Set<string>; hidden: boolean }) {
  const { t } = useI18n();
  const shown = useRef<string | null>(null);

  function jumpTo(event: PointerEvent<HTMLElement>) {
    const letters = event.currentTarget.querySelectorAll<HTMLElement>("[data-letter]");
    const first = letters[0]?.getBoundingClientRect();
    const last = letters[letters.length - 1]?.getBoundingClientRect();
    if (!first || !last) return;
    const step = (last.bottom - first.top) / letters.length;
    const index = Math.min(
      letters.length - 1,
      Math.max(0, Math.floor((event.clientY - first.top) / step)),
    );
    const target = railTarget(ALPHABET.split(""), present, index);
    if (!target || target === shown.current) return;
    shown.current = target;
    document.getElementById(`g-${target}`)?.scrollIntoView();
  }

  return (
    <nav
      id="rail"
      hidden={hidden}
      aria-label={t("index_label")}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        event.currentTarget.setPointerCapture(event.pointerId);
        shown.current = null;
        jumpTo(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) jumpTo(event);
      }}
      className="fixed bottom-6 right-0.5 top-[calc(var(--header-h)+0.875rem)] z-10 flex touch-none select-none flex-col [-webkit-touch-callout:none] items-center justify-center font-display text-small font-bold leading-none lg:absolute lg:bottom-4 lg:right-1.5 lg:top-4"
    >
      {ALPHABET.split("").map((letter) => {
        if (present.has(letter)) {
          return (
            <a
              key={letter}
              href={`#g-${letter}`}
              data-letter={letter}
              className="grid h-4 w-5 place-items-center rounded-sm text-foreground transition-colors hover:text-brand"
            >
              {letter}
            </a>
          );
        }
        // Absent letters are not navigable: a span, hidden from assistive tech.
        return (
          <span
            key={letter}
            data-letter={letter}
            aria-hidden="true"
            className="pointer-events-none grid h-4 w-5 place-items-center rounded-sm text-leader"
          >
            {letter}
          </span>
        );
      })}
    </nav>
  );
}
