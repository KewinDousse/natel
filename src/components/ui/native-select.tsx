/**
 * The platform's own select, with the chevron the app's other menus draw
 * (DESIGN.md "Selects"): the list, the keyboard and the touch behaviour stay
 * the platform's. The select and the chevron both take the wrapper's text
 * colour, which `wrapperClassName` sets.
 */

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "./icons";

export function NativeSelect({
  className,
  wrapperClassName,
  ...props
}: ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative text-foreground", wrapperClassName)}>
      <select {...props} className={cn(className, "block appearance-none pr-8 text-inherit")} />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2" />
    </div>
  );
}
