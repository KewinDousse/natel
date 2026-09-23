/**
 * Contacts layout route — the Phase 2 directory screen. Thin: composes the
 * header, list pane and detail pane, and owns the search/sort state that both
 * panes share. All grouping/search logic lives in src/lib/contact-list.ts.
 */

import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { ContactDetailPane } from "@/components/contact-detail";
import { ContactList } from "@/components/contact-list";
import { useI18n } from "@/i18n/react";
import type { SortBy } from "@/lib/contact-list";
import { cn } from "@/lib/utils";
import { useAddressBooks, useContacts } from "@/queries";
import { useAuth, useSelectedBook, useSessionStore } from "@/store/session";

export const Route = createFileRoute("/contacts")({
  beforeLoad: () => {
    if (!useSessionStore.getState().auth) throw redirect({ to: "/login" });
  },
  component: ContactsRoute,
});

function ContactsRoute() {
  const { t } = useI18n();
  const auth = useAuth();
  const selectBook = useSessionStore((state) => state.selectBook);
  const selectedBook = useSelectedBook();
  const hasContact = useRouterState({
    select: (state) => state.location.pathname.startsWith("/contacts/"),
  });

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("family");

  useEffect(() => {
    document.title = t("contacts_doc_title");
  }, [t]);

  const booksQuery = useAddressBooks(auth ?? undefined);
  const books = booksQuery.isPlaceholderData ? undefined : booksQuery.data;

  // No book selected yet → pick the first one once discovery returns.
  useEffect(() => {
    if (books && books.length > 0 && selectedBook === null) {
      const first = books[0];
      if (first) selectBook(first);
    }
  }, [books, selectedBook, selectBook]);

  const contactsQuery = useContacts(auth ?? undefined, selectedBook ?? undefined);
  const contacts = contactsQuery.isPlaceholderData ? undefined : contactsQuery.data?.contacts;

  return (
    <div className="lg:grid lg:h-dvh lg:grid-rows-[auto_1fr]">
      <AppHeader
        books={books}
        selectedBook={selectedBook}
        onSelectBook={selectBook}
        query={query}
        onQueryChange={setQuery}
        syncedAt={contactsQuery.dataUpdatedAt}
        hiddenOnMobile={hasContact}
      />
      <main className="lg:grid lg:min-h-0 lg:grid-cols-[minmax(26rem,34rem)_1fr]">
        <div className={cn("relative lg:min-h-0 lg:border-r", hasContact && "max-lg:hidden")}>
          <ContactList
            contacts={contacts}
            noBooks={books !== undefined && books.length === 0}
            query={query}
            sortBy={sortBy}
            onSortBy={setSortBy}
          />
        </div>
        <ContactDetailPane hasContact={hasContact}>
          <Outlet />
        </ContactDetailPane>
      </main>
    </div>
  );
}
