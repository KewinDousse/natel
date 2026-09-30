/**
 * The crop frame's geometry (ADR 023), in the oriented image's pixels: a
 * square that fills the frame at 1× and shrinks as the zoom goes to 4×,
 * always inside the image. Pure: the dialog maps pointer, wheel and key
 * input onto these functions.
 */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Zoom and the centre of the square, in image pixels. */
export type CropState = { zoom: number; cx: number; cy: number };

export type Size = { width: number; height: number };

/** An area of the image, in whole pixels. */
export type Rect = { x: number; y: number; width: number; height: number };

/** The square's side in image pixels at a zoom. */
function sideAt(image: Size, zoom: number): number {
  return Math.min(image.width, image.height) / zoom;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The state keeps the square inside the image. */
function contained(image: Size, state: CropState): CropState {
  const zoom = clamp(state.zoom, MIN_ZOOM, MAX_ZOOM);
  const half = sideAt(image, zoom) / 2;
  return {
    zoom,
    cx: clamp(state.cx, half, image.width - half),
    cy: clamp(state.cy, half, image.height - half),
  };
}

/** How the frame opens: 1×, centred. */
export function initialCrop(image: Size): CropState {
  return { zoom: MIN_ZOOM, cx: image.width / 2, cy: image.height / 2 };
}

/** Screen pixels per image pixel, for a frame `frame` px wide. */
export function scaleOf(image: Size, state: CropState, frame: number): number {
  return frame / sideAt(image, state.zoom);
}

/** Moves the image by a drag of (dx, dy) screen pixels. */
export function pan(image: Size, state: CropState, dx: number, dy: number, frame: number) {
  const scale = scaleOf(image, state, frame);
  return contained(image, { ...state, cx: state.cx - dx / scale, cy: state.cy - dy / scale });
}

/**
 * Zooms to `zoom`, keeping the image point under the frame's centre in place
 * unless the square would leave the image.
 */
export function zoomTo(image: Size, state: CropState, zoom: number): CropState {
  return contained(image, { ...state, zoom });
}

/** The square the frame shows, in whole image pixels. */
export function cropRect(image: Size, state: CropState): Rect {
  const side = Math.max(1, Math.round(sideAt(image, state.zoom)));
  const x = clamp(Math.round(state.cx - side / 2), 0, image.width - side);
  const y = clamp(Math.round(state.cy - side / 2), 0, image.height - side);
  return { x, y, width: side, height: side };
}

/**
 * Whether the frame ends as it opened, compared by the square it shows, so a
 * frame moved and brought back counts as unchanged: the image is then kept
 * whole, and clients show the same centred square of it.
 */
export function isUnchanged(image: Size, state: CropState): boolean {
  const now = cropRect(image, state);
  const initial = cropRect(image, initialCrop(image));
  return (
    now.x === initial.x &&
    now.y === initial.y &&
    now.width === initial.width &&
    now.height === initial.height
  );
}
