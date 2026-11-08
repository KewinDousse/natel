import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { contactById } from "@/lib/contact-list";
import { DEMO_ARRIVAL_CONTACT, IS_DEMO } from "@/lib/demo";
import { isDesktop } from "@/lib/shortcuts";
import type { Contact } from "@/model/contact";

// Once per page load: coming back to the list later leaves it as it is.
let arriving = IS_DEMO;
// A switch to another book before the first one's contacts load is not an arrival.
let arrivalBook: string | undefined;

/**
 * In the demo, on a wide screen, when a book's list is the first page of the
 * directory a page load shows, opens that book's arrival contact beside it.
 */
export function useDemoArrival(
  leafRoute: string | undefined,
  book: string | undefined,
  contacts: Contact[] | undefined,
) {
  const navigate = useNavigate();
  useEffect(() => {
    // `/contacts` is still on its way to a book's list.
    if (!arriving || leafRoute === undefined || leafRoute === "/_directory/contacts/") return;
    if (leafRoute === "/_directory/contacts/$book" && isDesktop()) {
      if (book === undefined) return;
      arrivalBook ??= book;
      if (book === arrivalBook && contacts === undefined) return;
      const id = DEMO_ARRIVAL_CONTACT.get(book);
      if (book === arrivalBook && id !== undefined && contacts && contactById(contacts, id)) {
        void navigate({ to: "/contacts/$book/$id", params: { book, id }, replace: true });
      }
    }
    arriving = false;
  }, [leafRoute, book, contacts, navigate]);
}
