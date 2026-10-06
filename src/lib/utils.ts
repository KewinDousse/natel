import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type scale's own sizes (src/index.css @theme), so `text-body` and a
// colour such as `text-muted-foreground` aren't taken for one another.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["caption", "small", "body", "wordmark", "title-sm", "title", "index", "person"] },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
