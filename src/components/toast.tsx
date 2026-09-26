/**
 * Toast — one short status message at the bottom of the screen. Lives in the
 * contacts layout rather than in a contact page, so a toast outlives the page
 * that raised it (a created contact opens a new page right after saving).
 */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

// Without a provider, toasts are dropped: nothing else depends on them.
const ToastContext = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  // An object per toast, so showing the same text twice restarts the timer.
  const [toast, setToast] = useState<{ text: string } | null>(null);
  const show = useCallback((text: string) => setToast({ text }), []);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast !== null && (
        <div
          className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background shadow-float"
          role="status"
          aria-live="polite"
        >
          {toast.text}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/** Show a toast; replaces the one on screen, if any. */
export function useToast(): (text: string) => void {
  return useContext(ToastContext);
}
