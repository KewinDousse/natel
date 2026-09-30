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
  // Leaving edit mode drops the param entirely rather than leaving ?edit=false.
  validateSearch: (search: Record<string, unknown>): { edit?: true } =>
    search.edit === "true" || search.edit === true ? { edit: true } : {},
  component: ContactDetailRoute,
});

function ContactDetailRoute() {
  const { id } = Route.useParams();
  const { edit } = Route.useSearch();
  const auth = useAuth();
  const book = useSelectedBook();
  const contactsQuery = useContacts(auth ?? undefined, book ?? undefined);
  const data = contactsQuery.isPlaceholderData ? undefined : contactsQuery.data;
  return (
    <ContactPage
      contacts={data?.contacts}
      groupCards={data?.groups ?? []}
      id={id}
      edit={edit === true}
    />
  );
}
