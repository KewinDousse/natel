import { useEffect, useRef } from "react";
import { isDialogOpen, isInMenu, isPlainKey, isTyping } from "@/lib/shortcuts";

/**
 * The contact page's keys (DESIGN.md "Keyboard shortcuts"): E enters edit
 * mode; in edit mode, Esc and ⌘/Ctrl + Enter. Esc does nothing while a
 * delete or a move is in flight.
 */
export function useEditShortcuts({
  edit,
  busy,
  deleting,
  onToggleEdit,
  onEscape,
  onSave,
}: {
  edit: boolean;
  busy: boolean;
  deleting: boolean;
  onToggleEdit: () => void;
  onEscape: () => void;
  onSave: () => Promise<void>;
}) {
  useEffect(() => {
    if (edit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || !isPlainKey(e) || isTyping(e.target) || isInMenu(e.target)) return;
      if (isDialogOpen()) return;
      if (e.key === "e" || e.key === "E") onToggleEdit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [edit, onToggleEdit]);

  useEffect(() => {
    if (!edit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || deleting) return;
      onEscape();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [edit, deleting, onEscape]);

  // ⌘/Ctrl + Enter saves, from a field too (⌘S belongs to the browser).
  const saveRef = useRef(onSave);
  const canSaveRef = useRef(false);
  const deferredSave = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    saveRef.current = onSave;
    canSaveRef.current = edit && !busy;
  });
  useEffect(() => () => clearTimeout(deferredSave.current), []);
  useEffect(() => {
    if (!edit) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.repeat || e.isComposing || busy || isDialogOpen()) return;
      e.preventDefault();
      // A field that commits on blur, such as "Ajouter un groupe", commits its
      // value first; the save then runs once the draft holds it.
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        active.dataset.commitOnBlur !== undefined &&
        active.value.trim() !== ""
      ) {
        active.blur();
        deferredSave.current = setTimeout(() => {
          if (canSaveRef.current && !isDialogOpen()) void saveRef.current();
        }, 0);
        return;
      }
      void onSave();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [edit, busy, onSave]);
}
