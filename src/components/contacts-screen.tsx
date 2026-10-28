/** The directory screen: shared list state and pane composition. */

import { Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { ContactDetailPane } from "@/components/contact-detail";
import { ContactList, type ListLoad } from "@/components/contact-list";
import { ImportDialog } from "@/components/import-dialog";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import type { SyncState } from "@/components/sync-warning";
import { UploadIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { useBookTransfer } from "@/hooks/use-book-transfer";
import { useVcfDrop } from "@/hooks/use-vcf-drop";
import { useI18n } from "@/i18n/react";
import { bookParam, findBook } from "@/lib/book-param";
import { contactById } from "@/lib/contact-list";
import { cn } from "@/lib/utils";
import { bookName } from "@/lib/vcf-file";
import { DavError, useAddressBooks, useContacts } from "@/queries";
import { usePreferences } from "@/store/preferences";
import { useAuth, useSelectedBook, useSessionStore } from "@/store/session";

/**
 * The pages of the book `book` names, once ContactsScreen has selected it:
 * until then, a contact would be looked up in another book.
 */
export function SelectedBookOutlet({ book }: { book: string }) {
  const selected = useSelectedBook();
  return selected !== null && bookParam(selected) === book ? <Outlet /> : null;
}

/** The routes that show the list alone, with nothing beside it. */
const LIST_ROUTES = new Set(["/_directory/contacts/", "/_directory/contacts/$book"]);

export function ContactsScreen() {
  const { t } = useI18n();
  const showToast = useToast();
  const navigate = useNavigate();
  const { importState, importBook, exporting, exportBook, importFile, confirmImport, closeImport } =
    useBookTransfer();
  const auth = useAuth();
  const selectBook = useSessionStore((state) => state.selectBook);
  const selectedBook = useSelectedBook();
  const urlBook = useParams({ strict: false, select: (params) => params.book });
  const leafRoute = useRouterState({
    select: (state): string | undefined => state.matches.at(-1)?.routeId,
  });
  const hasContact = leafRoute !== undefined && !LIST_ROUTES.has(leafRoute);

  const [query, setQuery] = useState("");
  const sortBy = usePreferences((state) => state.sortBy);
  const setSortBy = usePreferences((state) => state.setSortBy);
  const groupFilter = useSessionStore((state) => state.groupFilter);
  const setGroupFilter = useSessionStore((state) => state.setGroupFilter);

  // A contact, a new contact or the settings name the tab themselves.
  useEffect(() => {
    if (!hasContact) document.title = t("contacts_doc_title");
  }, [t, hasContact]);

  const booksQuery = useAddressBooks(auth ?? undefined);
  const books = booksQuery.isPlaceholderData ? undefined : booksQuery.data;

  // Once discovery returns, the book the URL names. Where it names none, as
  // on the settings, or one the server doesn't have, the selected book
  // stays while the server still has it, else the first one.
  useEffect(() => {
    if (!books) return;
    const kept = books.find((book) => book.href === selectedBook?.href);
    const book = findBook(books, urlBook) ?? kept ?? books[0];
    if (book && book.href !== selectedBook?.href) selectBook(book);
  }, [books, selectedBook, selectBook, urlBook]);

  const contactsQuery = useContacts(auth ?? undefined, selectedBook ?? undefined);
  const book = contactsQuery.isPlaceholderData ? undefined : contactsQuery.data;
  const contacts = book?.contacts;

  // /contacts, or a book the server doesn't have, opens the selected book in
  // its place. /contacts/<id>, with no book, opens that contact in the
  // selected book (ADR 043).
  useEffect(() => {
    if (!books || selectedBook === null) return;
    const named = findBook(books, urlBook) !== undefined;
    if (leafRoute !== "/_directory/contacts/" && (urlBook === undefined || named)) return;
    const book = bookParam(selectedBook);
    const legacy = leafRoute === "/_directory/contacts/$book" ? urlBook : undefined;
    if (legacy !== undefined && contacts === undefined && !contactsQuery.isError) return;
    if (legacy !== undefined && contacts && contactById(contacts, legacy)) {
      void navigate({ to: "/contacts/$book/$id", params: { book, id: legacy }, replace: true });
    } else {
      void navigate({ to: "/contacts/$book", params: { book }, replace: true });
    }
  }, [books, selectedBook, urlBook, leafRoute, contacts, contactsQuery.isError, navigate]);

  // What the list shows while it has no contacts: a failed discovery or load
  // says so, anything else, a retry included, is still on its way.
  const loadError = booksQuery.error ?? contactsQuery.error;
  const retrying = booksQuery.isFetching || contactsQuery.isFetching;
  // Only for contacts already shown: a book that never loaded says so in the list.
  const reloadFailed =
    contacts !== undefined &&
    (contactsQuery.isRefetchError || contactsQuery.fetchStatus === "paused");
  const syncState: SyncState = !reloadFailed
    ? "ok"
    : contactsQuery.error instanceof DavError && contactsQuery.error.code === "AUTH"
      ? "expired"
      : contactsQuery.isFetching || contactsQuery.fetchStatus === "paused"
        ? "retrying"
        : "failed";
  // Like the book menu's import, only once the book's cards are known, and
  // not over an import already running.
  const dropping = useVcfDrop(
    contacts !== undefined && importState === null ? importFile : undefined,
    () => showToast(t("import_drop_refused")),
  );

  const listLoad: ListLoad =
    loadError === null || retrying
      ? { kind: "loading" }
      : { kind: "failed", expired: loadError instanceof DavError && loadError.code === "AUTH" };

  return (
    <>
      <div className="lg:grid lg:h-dvh lg:grid-rows-[auto_1fr]">
        <AppHeader
          books={books}
          selectedBook={selectedBook}
          onSelectBook={(next) => {
            if (next.href === selectedBook?.href) return;
            // Outside a book, as on the settings, the page stays.
            if (urlBook === undefined) selectBook(next);
            else void navigate({ to: "/contacts/$book", params: { book: bookParam(next) } });
          }}
          canExport={
            !exporting && contacts !== undefined && contacts.length + (book?.groups.length ?? 0) > 0
          }
          canImport={contacts !== undefined}
          onExport={exportBook}
          onImport={importFile}
          query={query}
          onQueryChange={setQuery}
          sync={syncState}
          syncedAt={contactsQuery.dataUpdatedAt}
          onRetrySync={() => {
            void contactsQuery.refetch().then((result) => {
              if (result.isSuccess) showToast(t("synced"));
              // An expired session changes the warning itself, which says so.
              else if (!(result.error instanceof DavError && result.error.code === "AUTH"))
                showToast(t("sync_failed_again"));
            });
          }}
          hiddenOnMobile={hasContact}
        />
        <main className="lg:grid lg:min-h-0 lg:grid-cols-[minmax(26rem,34rem)_1fr]">
          {/* A contact, the settings or a new contact bring their own h1. */}
          {!hasContact && (
            <h1 className="sr-only">{selectedBook ? bookName(selectedBook) : t("list_label")}</h1>
          )}
          <div className={cn("relative lg:min-h-0 lg:border-r", hasContact && "max-lg:hidden")}>
            <ContactList
              contacts={contacts}
              skippedCount={book?.skipped.length ?? 0}
              retrying={contactsQuery.isFetching}
              onRetryCards={() => void contactsQuery.refetch()}
              noBooks={books !== undefined && books.length === 0}
              load={listLoad}
              onRetry={() => {
                if (booksQuery.isError) void booksQuery.refetch();
                else void contactsQuery.refetch();
              }}
              onImport={contacts !== undefined ? importFile : undefined}
              query={query}
              sortBy={sortBy}
              onSortBy={setSortBy}
              groupCards={book?.groups ?? []}
              groupFilter={groupFilter}
              onGroupFilter={setGroupFilter}
            />
          </div>
          <ContactDetailPane hasContact={hasContact}>
            <Outlet />
          </ContactDetailPane>
        </main>
      </div>
      <KeyboardShortcuts />
      {dropping && (
        // Pointer feedback only: the import dialog that follows is announced.
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6"
        >
          <div className="flex max-w-md flex-col items-center gap-4 rounded-lg border-2 border-dashed border-foreground px-8 py-10 text-center">
            <UploadIcon className="size-8" />
            <p className="font-display text-title-sm font-bold text-balance">
              {t("import_drop", { name: selectedBook ? bookName(selectedBook) : "" })}
            </p>
          </div>
        </div>
      )}
      {importState && (
        <ImportDialog
          bookName={importBook ? bookName(importBook) : ""}
          state={importState}
          onConfirm={(skipSimilar) => void confirmImport(skipSimilar)}
          onCancel={closeImport}
          onClose={() => {
            closeImport();
            // Back on the list with nothing selected, as ADR 020 has it.
            if (importBook) {
              void navigate({ to: "/contacts/$book", params: { book: bookParam(importBook) } });
            }
          }}
        />
      )}
    </>
  );
}
