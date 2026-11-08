import { useParams } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Brings the open contact's row into the list's view once the list shows it:
 * a direct link, the browser's history or the arrow keys can open a contact
 * whose row is far down the list. A row already in view stays where it is.
 */
export function useOpenRowInView(loaded: boolean) {
  const openId = useParams({ strict: false }).id;
  useEffect(() => {
    if (openId === undefined || !loaded) return;
    document
      .querySelector(`#list a[data-contact-id="${CSS.escape(openId)}"][data-status="active"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [openId, loaded]);
}
