/**
 * PhotoCropDialog — "Recadrer la photo" (ADR 023), built like the discard
 * dialog. The chosen image fills a square frame at first, centred, dimmed
 * outside it; the frame takes drag, pinch and wheel, and while focused the
 * arrow keys and + / -. A frame that ends as it opened keeps the image whole.
 */

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import {
  type CropState,
  cropRect,
  initialCrop,
  isUnchanged,
  MAX_ZOOM,
  MIN_ZOOM,
  pan,
  scaleOf,
  zoomTo,
} from "@/lib/photo-crop";
import { bitmapSize, PhotoError, type PreparedPhoto, preparePhoto } from "@/lib/photo-prepare";

/** The chosen file, decoded, or why it couldn't be. */
export type ChosenPhoto =
  | { bytes: Uint8Array; bitmap: ImageBitmap; url: string }
  | { error: PhotoError };

const ERROR_KEYS: Record<PhotoError["code"], TranslationKey> = {
  UNDECODABLE: "photo_err_undecodable",
  ENCODE_FAILED: "photo_err_encode",
};

/** Screen pixels an arrow key moves the image by. */
const KEY_STEP = 10;
/** Zoom factor of one + / - press or one wheel notch. */
const ZOOM_STEP = 1.1;

export function PhotoCropDialog({
  chosen,
  returnFocusTo,
  onCancel,
  onUse,
}: {
  chosen: ChosenPhoto;
  /** Where the focus goes back to: after the file picker, the focus is often lost. */
  returnFocusTo: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onUse: (photo: PreparedPhoto) => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const hintId = useId();
  const zoomId = useId();
  const image = "bitmap" in chosen ? chosen : null;
  const size = useMemo(
    () => ("bitmap" in chosen ? bitmapSize(chosen.bitmap) : { width: 1, height: 1 }),
    [chosen],
  );
  const [crop, setCrop] = useState<CropState>(() => initialCrop(size));
  const [frame, setFrame] = useState(0);
  const [error, setError] = useState<PhotoError | null>("error" in chosen ? chosen.error : null);
  const [working, setWorking] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const previous = document.activeElement;
    (frameRef.current ?? cancelRef.current)?.focus();
    return () => {
      const target = returnFocusTo.current ?? previous;
      if (target instanceof HTMLElement && target.isConnected) target.focus();
    };
  }, [returnFocusTo]);

  // Set while the dialog is shown, so a photo prepared after it closed is dropped.
  const closed = useRef(false);
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
    };
  }, []);

  // The frame's width in screen pixels, which the drag and zoom scale by.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const measure = () => setFrame(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // React's wheel listener is passive, so it couldn't stop the page scrolling.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setCrop((state) => zoomTo(size, state, state.zoom * factor));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [size]);

  const onPointerDown = (event: ReactPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const next = { x: event.clientX, y: event.clientY };
    const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      // Pinch: the zoom follows the distance between the two fingers.
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0) setCrop((state) => zoomTo(size, state, (state.zoom * after) / before));
    } else {
      setCrop((state) => pan(size, state, next.x - last.x, next.y - last.y, frame));
    }
    pointers.current.set(event.pointerId, next);
  };

  const onPointerEnd = (event: ReactPointerEvent) => {
    pointers.current.delete(event.pointerId);
  };

  const onFrameKey = (event: ReactKeyboardEvent) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setCrop((state) => pan(size, state, move[0], move[1], frame));
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setCrop((state) => zoomTo(size, state, state.zoom * ZOOM_STEP));
    } else if (event.key === "-") {
      event.preventDefault();
      setCrop((state) => zoomTo(size, state, state.zoom / ZOOM_STEP));
    }
  };

  const trapTab = (event: ReactKeyboardEvent) => {
    if (event.key !== "Tab") return;
    const first = frameRef.current ?? cancelRef.current;
    const last =
      applyRef.current && !applyRef.current.disabled ? applyRef.current : cancelRef.current;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const use = async () => {
    if (!image) return;
    setWorking(true);
    setError(null);
    try {
      const area = isUnchanged(size, crop) ? null : cropRect(size, crop);
      const photo = await preparePhoto(image.bytes, image.bitmap, area);
      // Esc may have closed the dialog meanwhile: that cancels the photo.
      if (!closed.current) onUse(photo);
    } catch (err) {
      if (closed.current) return;
      setError(err instanceof PhotoError ? err : new PhotoError("ENCODE_FAILED", err));
      setWorking(false);
    }
  };

  const scale = frame > 0 ? scaleOf(size, crop, frame) : 0;

  return (
    <div
      onClick={(event) => {
        if (!working && event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={trapTab}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={working}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center dark:bg-black/60"
    >
      <div
        role="document"
        className="w-full max-w-md rounded-t-xl bg-background p-6 shadow-overlay sm:rounded-xl"
      >
        <h2 id={titleId} className="font-display text-2xl font-bold leading-tight">
          {t("photo_crop_title")}
        </h2>
        {image && (
          <>
            <div className="relative mt-4 overflow-hidden rounded-xl bg-black">
              <div className="flex justify-center py-2">
                <div
                  ref={frameRef}
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: ADR 023 makes the frame the keyboard's target, a widget of its own
                  tabIndex={0}
                  role="application"
                  aria-label={t("photo_frame")}
                  aria-describedby={hintId}
                  onKeyDown={onFrameKey}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerEnd}
                  onPointerCancel={onPointerEnd}
                  className="relative aspect-square w-full max-w-80 cursor-grab touch-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing"
                >
                  {scale > 0 && (
                    <img
                      src={image.url}
                      alt=""
                      draggable={false}
                      className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left select-none"
                      style={{
                        width: size.width * scale,
                        height: size.height * scale,
                        transform: `translate(${frame / 2 - crop.cx * scale}px, ${frame / 2 - crop.cy * scale}px)`,
                      }}
                    />
                  )}
                  {/* Dims the image outside the frame; the stage clips it. */}
                  <div className="pointer-events-none absolute inset-0 rounded-xl shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]" />
                </div>
              </div>
            </div>
            <p id={hintId} className="mt-2 text-caption text-muted-foreground">
              {t("photo_frame_hint")}
            </p>
            <label htmlFor={zoomId} className="mt-3 block text-sm font-bold">
              {t("photo_zoom")}
            </label>
            <input
              id={zoomId}
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={crop.zoom}
              disabled={working}
              onChange={(event) =>
                setCrop((state) => zoomTo(size, state, Number(event.target.value)))
              }
              className="mt-1 w-full accent-primary"
            />
          </>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {t(ERROR_KEYS[error.code])}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={working}
            className="inline-flex h-10 items-center justify-center rounded-full border border-input bg-background px-4 text-sm font-bold hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          {image && (
            <button
              ref={applyRef}
              type="button"
              onClick={use}
              disabled={working}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {t("photo_use")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
