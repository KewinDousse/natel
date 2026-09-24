/**
 * EditableCell — the stacked cell from DESIGN.md "The trick: stacked cells
 * with identical boxes".
 *
 * The view layer uses exactly the edit input's box recipe (h-11, px-3.5,
 * rounded-md, border-transparent) so no text shifts when edit mode lands.
 * An optional edit layer stays invisible and out of the tab order until the
 * page root's data-mode flips to "edit".
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The shared input box recipe the edit children (next task) will match. */
const BOX_RECIPE = "flex h-11 items-center rounded-md border border-transparent px-3.5";

/** View layer: hidden (and untabbable) only once edit mode is active. */
const HIDE_VIEW =
  "transition-opacity duration-200 group-data-[mode=edit]/fiche:invisible group-data-[mode=edit]/fiche:opacity-0";

/** Edit layer: invisible and untabbable until edit mode is active. */
const HIDE_EDIT =
  "invisible opacity-0 transition-opacity duration-200 group-data-[mode=edit]/fiche:visible group-data-[mode=edit]/fiche:opacity-100";

type EditableCellProps = {
  /** View content, framed with the shared input box recipe. */
  view: ReactNode;
  /** Optional edit content — arrives with the next task. */
  edit?: ReactNode;
  /** Extra/overriding frame classes (heights, typography, colours). */
  frameClassName?: string;
  /** Extra classes for the stacked grid itself (e.g. justify-items-end). */
  cellClassName?: string;
  /**
   * Drop the input box recipe — for stacked rows where the view content is
   * not an input (action row, copy buttons).
   */
  unboxed?: boolean;
};

export function EditableCell({
  view,
  edit,
  frameClassName,
  cellClassName,
  unboxed = false,
}: EditableCellProps) {
  return (
    <div className={cn("grid min-w-0 [&>*]:[grid-area:1/1]", cellClassName)}>
      <div className={cn(!unboxed && BOX_RECIPE, "min-w-0", HIDE_VIEW, frameClassName)}>{view}</div>
      {edit !== undefined && <div className={cn("min-w-0", HIDE_EDIT)}>{edit}</div>}
    </div>
  );
}
