import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { type ContactGroup, contactIdOf } from "@/lib/contact-list";
import { isDesktop, isDialogOpen, isInMenu, isTyping } from "@/lib/shortcuts";

/**
 * `↑` / `↓` open the previous / next contact in the list as shown, on desktop
 * where both panes are visible. With none open, `↓` opens the first and `↑`
 * the last. A focused row hands its focus on, so Tab and Enter carry on from
 * the new one.
 */
export function useArrowNavigation(groups: ContactGroup[]) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.shiftKey) return;
      if (isTyping(event.target) || isInMenu(event.target) || isDialogOpen() || !isDesktop())
        return;
      const leafRoute = router.state.matches.at(-1)?.routeId;
      if (leafRoute !== "/contacts" && leafRoute !== "/contacts/$id") return;
      const ids = groups.flatMap((group) => group.contacts.map(contactIdOf));
      if (ids.length === 0) return;
      // The latest location, not the rendered one: a key pressed right after
      // the last one must move on from where that one went.
      const match = /^\/contacts\/([^/]+)$/.exec(router.latestLocation.pathname);
      const at = match?.[1] ? ids.indexOf(decodeURIComponent(match[1])) : -1;
      const next =
        event.key === "ArrowDown"
          ? at === -1
            ? 0
            : Math.min(at + 1, ids.length - 1)
          : at === -1
            ? ids.length - 1
            : Math.max(at - 1, 0);
      const target = ids[next];
      if (target === undefined || next === at) return;
      event.preventDefault();
      const rowFocused = document.activeElement?.closest("#list") != null;
      void router.navigate({ to: "/contacts/$id", params: { id: target } }).then(() => {
        // A navigation the discard dialog held back settles only with a
        // later one: act only if this row is still the open contact.
        const row = document.querySelector<HTMLElement>(
          `#list a[data-contact-id="${CSS.escape(target)}"][data-status="active"]`,
        );
        row?.scrollIntoView({ block: "nearest" });
        if (rowFocused && !isDialogOpen()) row?.focus();
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [groups, router]);
}
