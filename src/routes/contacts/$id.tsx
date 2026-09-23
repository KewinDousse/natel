/**
 * Minimal contact detail route — placeholder until the real detail page task.
 * Shows only the selected contact's name so the list selection mechanism
 * (aria-current, mobile pane swap, back bar) is exercisable end to end.
 */

import { createFileRoute } from "@tanstack/react-router";
import { contactById, namePartsOf } from "@/lib/contact-list";
import { useContacts } from "@/queries";
import { useAuth, useSelectedBook } from "@/store/session";

export const Route = createFileRoute("/contacts/$id")({
  component: ContactDetailStub,
});

function ContactDetailStub() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const book = useSelectedBook();
  const { data } = useContacts(auth ?? undefined, book ?? undefined);
  const contact = contactById(data?.contacts ?? [], id);
  const name = contact ? namePartsOf(contact).display : "";

  return (
    <h1 className="pt-2 font-display text-[2.25rem] font-bold leading-[0.95] tracking-[-0.005em] sm:text-[2.75rem] lg:text-person">
      {name}
    </h1>
  );
}
