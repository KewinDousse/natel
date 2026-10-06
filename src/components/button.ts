/**
 * Class recipes for the controls DESIGN.md "Buttons" and "Form fields"
 * describe, shared by <button>, <a> and router links alike.
 */

import { cn } from "@/lib/utils";

/** Keyboard focus: a 2px ring in ink, offset by the page's own colour. */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type Variant = "primary" | "outline" | "destructive" | "ghost";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/75",
  outline: "border border-input bg-background text-foreground hover:bg-accent",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/85",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base lg:h-11",
  icon: "size-10",
  "icon-sm": "size-9",
};

/** A pill button: primary (ink), outline, destructive or ghost. */
export function buttonClass(
  { variant = "primary", size = "md" }: { variant?: Variant; size?: Size } = {},
  className?: string,
): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-bold transition-colors disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    FOCUS_RING,
    className,
  );
}

/** A text field, select or textarea: the form-field recipe. */
export function fieldClass(className?: string): string {
  return cn(
    "field block w-full rounded-md border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground aria-[invalid=true]:border-destructive lg:text-body",
    className,
  );
}
