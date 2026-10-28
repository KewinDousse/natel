import { useEffect, useRef, useState } from "react";
import { isDialogOpen } from "@/lib/shortcuts";

const VCARD_TYPES = new Set(["text/vcard", "text/x-vcard"]);

/** The same files the import's file picker offers. */
function isVcf(file: File): boolean {
  return /\.vcf$/i.test(file.name) || VCARD_TYPES.has(file.type);
}

function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/**
 * A .vcf file dropped anywhere in the window goes to `onFile`, and any other
 * drop of files to `onRefused`. Without `onFile`, or while a dialog is open,
 * files are refused before the drop. Either way the browser never gets the
 * file: it would open it in place of the app, and an unsaved edit with it.
 * A drag that starts in the page, such as a photo, is left alone. True while
 * files are dragged over the window and would be taken.
 */
export function useVcfDrop(
  onFile: ((file: File) => void) | undefined,
  onRefused: () => void,
): boolean {
  const [dragging, setDragging] = useState(false);
  const handlers = useRef({ onFile, onRefused });
  useEffect(() => {
    handlers.current = { onFile, onRefused };
  });

  useEffect(() => {
    // dragenter and dragleave fire for each element crossed: count them.
    let depth = 0;
    let fromPage = false;
    const accepts = () => handlers.current.onFile !== undefined && !isDialogOpen();
    function start() {
      fromPage = true;
    }
    function end() {
      fromPage = false;
    }
    function carriesOutsideFiles(event: DragEvent): boolean {
      return !fromPage && carriesFiles(event);
    }
    function enter(event: DragEvent) {
      if (!carriesOutsideFiles(event)) return;
      depth += 1;
      setDragging(accepts());
    }
    function over(event: DragEvent) {
      if (!carriesOutsideFiles(event)) return;
      event.preventDefault();
      // The book may finish loading, or a dialog close, during the drag.
      const accepted = accepts();
      setDragging(accepted);
      if (event.dataTransfer) event.dataTransfer.dropEffect = accepted ? "copy" : "none";
    }
    function leave(event: DragEvent) {
      if (!carriesOutsideFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    }
    function drop(event: DragEvent) {
      // A dragged element removed from the page never sends its dragend.
      if (fromPage) {
        fromPage = false;
        return;
      }
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const { onFile: take, onRefused: refuse } = handlers.current;
      if (!take || isDialogOpen()) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      const [file] = files;
      if (files.length === 1 && file && isVcf(file)) take(file);
      else refuse();
    }
    window.addEventListener("dragstart", start);
    window.addEventListener("dragend", end);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragstart", start);
      window.removeEventListener("dragend", end);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  return dragging;
}
