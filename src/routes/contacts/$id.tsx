/**
 * Contact detail route — replaces the original stub with the real view page.
 *
 * Route stays thin: resolves the id param and passes contacts + id to the
 * ContactPage component. Page logic lives in src/components/contact-page.tsx.
 *
 * Supports ?edit search param for switching between view and edit mode.
 */

import { createFileRoute } from "@tanstack/react-router";
import { ContactPage } from "@/components/contact-page";
import { useContacts } from "@/queries";
import { useAuth, useSelectedBook } from "@/store/session";

export const Route = createFileRoute("/contacts/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: search.edit === "true" || search.edit === true,
  }),
  component: ContactDetailRoute,
});

function ContactDetailRoute() {
  const { id } = Route.useParams();
  const { edit } = Route.useSearch();
  const auth = useAuth();
  const book = useSelectedBook();
  const contactsQuery = useContacts(auth ?? undefined, book ?? undefined);
  const contacts = contactsQuery.isPlaceholderData ? undefined : contactsQuery.data?.contacts;
  return <ContactPage contacts={contacts} id={id} edit={edit ?? false} />;
}
