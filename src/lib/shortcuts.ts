/**
 * Shared gates for the single-key shortcuts (DESIGN.md, Keyboard shortcuts):
 * none fires while the user types in a field, behind a dialog, or with a
 * modifier it doesn't expect.
 */

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable === true
  );
}

/**
 * No Ctrl, ⌘ or Alt. Shift and AltGr are left to the key itself: some
 * layouts need them to type `/` or `?`, and Windows reports AltGr as Ctrl+Alt.
 */
export function isPlainKey(event: KeyboardEvent): boolean {
  if (event.metaKey) return false;
  if (event.getModifierState?.("AltGraph")) return true;
  return !event.ctrlKey && !event.altKey;
}

/** In an open menu, or on the button that opens one: its keys are its own. */
export function isInMenu(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="menu"], [aria-haspopup]') !== null;
}

export function isDialogOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/** Desktop width, where the list and the contact sit side by side. */
export function isDesktop(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(min-width: 64rem)").matches;
}

export function isApple(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}
