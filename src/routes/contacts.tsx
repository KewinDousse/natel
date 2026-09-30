/**
 * Contacts layout route — the Phase 2 directory screen. Thin: composes the
 * header, list pane and detail pane, and owns the search/sort state that both
 * panes share. All grouping/search logic lives in src/lib/contact-list.ts.
 */

import { useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { ContactDetailPane } from "@/components/contact-detail";
import { ContactList } from "@/components/contact-list";
import { ImportDialog, type ImportState } from "@/components/import-dialog";
import { ToastProvider, useToast } from "@/components/toast";
import { useI18n } from "@/i18n/react";
import type { SortBy } from "@/lib/contact-list";
import { cn } from "@/lib/utils";
import { bookName, downloadText, exportFileName } from "@/lib/vcf-file";
import {
  EmptyImportError,
  exportVcf,
  IncompleteExportError,
  importVcf,
  type LoadFullBookResult,
  useAddressBooks,
  useContacts,
} from "@/queries";
import { contactsKey } from "@/queries/keys";
import { useAuth, useSelectedBook, useSessionStore } from "@/store/session";
import { isGroupCard } from "@/vcard";

export const Route = createFileRoute("/contacts")({
  beforeLoad: () => {
    if (!useSessionStore.getState().auth) throw redirect({ to: "/login" });
  },
  component: ContactsRoute,
});

function ContactsRoute() {
  return (
    <ToastProvider>
      <ContactsScreen />
    </ToastProvider>
  );
}

function ContactsScreen() {
  const { t } = useI18n();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [exporting, setExporting] = useState(false);
  // Cards imports created this session that the list can't parse, per book:
  // they are in the book though the list doesn't show them, and the user
  // can't delete them from it either.
  const imported = useRef(new Map<string, Set<string>>());
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
  const book = contactsQuery.isPlaceholderData ? undefined : contactsQuery.data;
  const contacts = book?.contacts;

  async function exportBook() {
    if (!auth || !selectedBook) return;
    setExporting(true);
    try {
      downloadText(await exportVcf(auth, selectedBook.href), exportFileName(selectedBook));
    } catch (err) {
      showToast(
        err instanceof IncompleteExportError
          ? t("export_incomplete", { n: String(err.missing) })
          : t("export_failed"),
      );
    } finally {
      setExporting(false);
    }
  }

  async function importFile(file: File) {
    if (!auth || !selectedBook) return;
    const key = contactsKey(auth, selectedBook);
    setImportState({ phase: "running", done: 0, total: 0 });
    // A refetch landing mid-import would replace the list and drop the cards
    // added to it so far.
    await queryClient.cancelQueries({ queryKey: key });
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportState({ phase: "error", message: t("import_unreadable_file") });
      return;
    }
    const cached = queryClient.getQueryData<LoadFullBookResult>(key);
    // Group cards are cards of the book too: importing one it has skips it.
    const loaded = [...(cached?.contacts ?? []), ...(cached?.groups ?? [])];
    const bookKey = key.join("\n");
    const created = imported.current.get(bookKey) ?? new Set<string>();
    imported.current.set(bookKey, created);
    try {
      const result = await importVcf(
        auth,
        selectedBook.href,
        text,
        new Set([...loaded.map((contact) => contact.uid), ...created]),
        {
          onProgress: (done, total) => setImportState({ phase: "running", done, total }),
          onCreated: (uid, contact) => {
            if (!contact) created.add(uid);
            else
              queryClient.setQueryData<LoadFullBookResult>(
                key,
                (old) =>
                  old &&
                  (isGroupCard(contact)
                    ? { ...old, groups: [...old.groups, contact] }
                    : { ...old, contacts: [...old.contacts, contact] }),
              );
          },
        },
      );
      setImportState({ phase: "done", result });
      // A refetch that started during the import may have missed some cards.
      void queryClient.invalidateQueries({ queryKey: key });
    } catch (err) {
      setImportState({
        phase: "error",
        message: err instanceof EmptyImportError ? t("import_empty") : t("import_failed_generic"),
      });
    }
  }

  return (
    <>
      <div className="lg:grid lg:h-dvh lg:grid-rows-[auto_1fr]">
        <AppHeader
          books={books}
          selectedBook={selectedBook}
          onSelectBook={selectBook}
          canExport={
            !exporting && contacts !== undefined && contacts.length + (book?.groups.length ?? 0) > 0
          }
          canImport={contacts !== undefined}
          onExport={exportBook}
          onImport={importFile}
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
      {importState && (
        <ImportDialog
          bookName={selectedBook ? bookName(selectedBook) : ""}
          state={importState}
          onClose={() => {
            setImportState(null);
            // Back on the list with nothing selected, as ADR 020 has it.
            void navigate({ to: "/contacts" });
          }}
        />
      )}
    </>
  );
}
