import { useParams } from "@tanstack/react-router";
import { type RefObject, useEffect } from "react";
import type { ContactListHandle } from "@/components/virtual-sections";

/**
 * Brings the open contact's row into the list's view once the list shows it:
 * a direct link, the browser's history or the arrow keys can open a contact
 * whose row is far down the list. A row already in view stays where it is.
 */
export function useOpenRowInView(loaded: boolean, list: RefObject<ContactListHandle | null>) {
  const openId = useParams({ strict: false }).id;
  useEffect(() => {
    if (openId === undefined || !loaded) return;
    const row = document.querySelector(
      `#list a[data-contact-id="${CSS.escape(openId)}"][data-status="active"]`,
    );
    // A virtual list has no row for a contact far from the viewport.
    if (row === null) list.current?.reveal(openId);
    else row.scrollIntoView?.({ block: "nearest" });
  }, [openId, loaded, list]);
}
