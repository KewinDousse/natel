import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Checkbox with the handoff styling.
 *
 * Hand-built instead of the shadcn registry component: the registry version
 * (style "base-nova") imports @base-ui/react and lucide-react, which are not
 * in the approved stack, and its markup differs from the reference (the
 * reference uses a plain accent-coloured native input).
 */
function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn("mt-0.5 size-4 shrink-0 accent-[var(--primary)]", className)}
      {...props}
    />
  );
}

export { Checkbox };
