/**
 * How this browser can install Natel: Chromium's own dialog, the Share menu
 * on iPhone and iPad, or not at all from here (already installed, or a
 * browser that offers neither).
 */

export type InstallWay =
  | { kind: "prompt"; install: () => Promise<void> }
  | { kind: "share" }
  | null;

/** Chromium's `beforeinstallprompt` event, which the DOM types lack. */
type InstallPromptEvent = Event & { prompt: () => Promise<unknown> };

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
let current: InstallWay = null;

function notify() {
  current = compute();
  for (const listener of listeners) listener();
}

function standalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || (window.matchMedia?.("(display-mode: standalone)").matches ?? false);
}

/** iPadOS presents itself as a Mac: a touch screen tells them apart. */
function appleMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function compute(): InstallWay {
  if (installed || standalone()) return null;
  const event = deferred;
  if (event) {
    return {
      kind: "prompt",
      install: async () => {
        // The event can open the dialog once: whatever the choice, the button goes.
        if (deferred !== event) return;
        deferred = null;
        notify();
        // A refusal by the browser leaves nothing to do: the button is already gone.
        await event.prompt().catch(() => undefined);
      },
    };
  }
  return appleMobile() ? { kind: "share" } : null;
}

/**
 * Listens from startup: Chromium fires `beforeinstallprompt` once, usually
 * before the settings open. Returns the function that stops listening.
 */
export function watchInstall(): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  // No preventDefault: the browser keeps its own install prompt as well.
  window.addEventListener(
    "beforeinstallprompt",
    (event) => {
      deferred = event as InstallPromptEvent;
      notify();
    },
    { signal },
  );
  window.addEventListener(
    "appinstalled",
    () => {
      installed = true;
      deferred = null;
      notify();
    },
    { signal },
  );
  notify();
  return () => controller.abort();
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function installWay(): InstallWay {
  return current;
}
