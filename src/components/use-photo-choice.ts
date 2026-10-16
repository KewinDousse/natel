import { type RefObject, useCallback, useEffect, useState } from "react";
import { decodeImage, PhotoError } from "@/lib/photo-prepare";
import type { ChosenPhoto } from "./photo-crop-dialog";

/**
 * The photo picked for the crop dialog. `editSession` changes when edit mode
 * ends: a large image decodes slowly, and a result that lands after that is
 * dropped.
 */
export function usePhotoChoice(editSession: RefObject<number>) {
  const [chosenPhoto, setChosenPhoto] = useState<ChosenPhoto | null>(null);

  // The decoded image and its object URL go with the dialog.
  useEffect(() => {
    if (chosenPhoto === null || !("bitmap" in chosenPhoto)) return;
    return () => {
      chosenPhoto.bitmap.close();
      URL.revokeObjectURL(chosenPhoto.url);
    };
  }, [chosenPhoto]);

  const handlePhotoFile = useCallback(
    async (file: File) => {
      const session = editSession.current;
      let chosen: ChosenPhoto;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const bitmap = await decodeImage(file);
        if (session !== editSession.current) {
          bitmap.close();
          return;
        }
        chosen = { bytes, bitmap, url: URL.createObjectURL(file) };
      } catch (err) {
        chosen = { error: err instanceof PhotoError ? err : new PhotoError("UNDECODABLE", err) };
      }
      if (session === editSession.current) setChosenPhoto(chosen);
    },
    [editSession],
  );

  return [chosenPhoto, setChosenPhoto, handlePhotoFile] as const;
}
