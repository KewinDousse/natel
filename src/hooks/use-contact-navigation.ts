import { useBlocker, useRouter } from "@tanstack/react-router";
import { useCallback, useState } from "react";

/** The element that scrolls `element`: the detail pane from lg, the page below. */
function scrollParentOf(element: HTMLElement): HTMLElement | Window {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return window;
}

export function useContactNavigation({
  edit,
  hasChanges,
  book,
  routeId,
  onExit,
}: {
  edit: boolean;
  hasChanges: boolean;
  book: string;
  routeId: string;
  onExit: () => void;
}) {
  const router = useRouter();
  const [showDiscard, setShowDiscard] = useState(false);
  // Enter edit mode, keeping `anchor` (a section, or the top of the page) where
  // it is on the screen, and on a section the focus goes to its first field.
  const enterEdit = useCallback(
    (sectionId?: string) => {
      if (edit) return;
      const anchor = document.getElementById(sectionId ?? "fiche-top");
      const top = anchor?.getBoundingClientRect().top;
      router.navigate({
        to: "/contacts/$book/$id",
        params: { book, id: routeId },
        search: { edit: true },
        replace: true,
      });
      requestAnimationFrame(() => {
        const moved = document.getElementById(sectionId ?? "fiche-top");
        if (moved && top !== undefined) {
          scrollParentOf(moved).scrollBy(0, moved.getBoundingClientRect().top - top);
        }
        if (sectionId) {
          moved?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
        }
      });
    },
    [edit, router, book, routeId],
  );

  // Cancel / Esc
  const handleCancel = useCallback(() => {
    if (hasChanges) {
      setShowDiscard(true);
    } else {
      onExit();
    }
  }, [hasChanges, onExit]);

  // History blocker — intercept back/forward when dirty using TanStack Router's blocker API
  const blocker = useBlocker({
    shouldBlockFn: () => hasChanges,
    enableBeforeUnload: () => hasChanges,
    disabled: !edit,
    withResolver: true,
  });

  const blockerActive = blocker?.status === "blocked";

  const closeDiscard = useCallback(() => {
    setShowDiscard(false);
    if (blockerActive) blocker?.reset?.();
  }, [blockerActive, blocker]);

  const discard = () => {
    setShowDiscard(false);
    if (blockerActive) blocker?.proceed?.();
    else onExit();
  };

  return {
    enterEdit,
    handleCancel,
    showDiscard,
    setShowDiscard,
    closeDiscard,
    discard,
    blockerActive,
  };
}
