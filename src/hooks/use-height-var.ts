import { type RefObject, useEffect } from "react";

/** Keeps the CSS variable `name` on the root at the element's rendered height. */
export function useHeightVar(ref: RefObject<HTMLElement | null>, name: string) {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) document.documentElement.style.setProperty(name, `${height}px`);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(name);
    };
  }, [ref, name]);
}
