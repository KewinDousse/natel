import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/react";
import { pageNameOf } from "@/lib/contact-list";
import { similarContactFinder } from "@/lib/import-similar";
import { downloadText, exportFileName } from "@/lib/vcf-file";
import {
  type DavAddressBook,
  EmptyImportError,
  exportVcf,
  type ImportPlan,
  type ImportResult,
  IncompleteExportError,
  type LoadFullBookResult,
  type PlannedCard,
  planImport,
  runImport,
} from "@/queries";
import { contactsKey } from "@/queries/keys";
import { useAuth, useSelectedBook } from "@/store/session";
import { isGroupCard } from "@/vcard";

/** A card to create that looks like `match`, a contact the book has. */
export type SimilarCard = { card: PlannedCard; match: string };

export type ImportState =
  | { phase: "preview"; plan: ImportPlan; similar: SimilarCard[] }
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; result: ImportResult; skipped: number }
  | { phase: "error"; message: string };

export function useBookTransfer() {
  const { t } = useI18n();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const selectedBook = useSelectedBook();
  const [importState, setImportState] = useState<ImportState | null>(null);
  // The address picks the book, so Back can change it under an open import:
  // the import stays on the book it was opened for.
  const [importBook, setImportBook] = useState<DavAddressBook | null>(null);
  const [exporting, setExporting] = useState(false);
  // Cards imports created this session that the list can't parse, per book:
  // they are in the book though the list doesn't show them, and the user
  // can't delete them from it either.
  const imported = useRef(new Map<string, Set<string>>());
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

  /** Reads the file and shows what the import would do (ADR 042). */
  async function importFile(file: File) {
    const book = selectedBook;
    if (!auth || !book) return;
    setImportBook(book);
    setImportState({ phase: "running", done: 0, total: 0 });
    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportState({ phase: "error", message: t("import_unreadable_file") });
      return;
    }
    const cached = queryClient.getQueryData<LoadFullBookResult>(contactsKey(auth, book));
    // Group cards are cards of the book too: importing one it has skips it.
    const loaded = [...(cached?.contacts ?? []), ...(cached?.groups ?? [])];
    let plan: ImportPlan;
    try {
      plan = planImport(
        text,
        new Set([...loaded.map((contact) => contact.uid), ...createdIn(bookKeyOf(book))]),
      );
    } catch (err) {
      setImportState({
        phase: "error",
        message: err instanceof EmptyImportError ? t("import_empty") : t("import_failed_generic"),
      });
      return;
    }
    const similarTo = similarContactFinder(cached?.contacts ?? []);
    const similar = plan.create.flatMap((card) => {
      const match = card.contact && similarTo(card.contact);
      if (!match) return [];
      return [{ card, match: pageNameOf(match) || t("contact_unnamed") }];
    });
    setImportState({ phase: "preview", plan, similar });
  }

  /** Sends the previewed plan's cards, without the similar ones when `skipSimilar`. */
  async function confirmImport(skipSimilar: boolean) {
    const book = importBook;
    if (!auth || !book || importState?.phase !== "preview") return;
    const { plan, similar } = importState;
    const skipped = new Set(skipSimilar ? similar.map(({ card }) => card.position) : []);
    const cards = plan.create.filter((card) => !skipped.has(card.position));
    const key = contactsKey(auth, book);
    setImportState({ phase: "running", done: 0, total: cards.length });
    // A refetch landing mid-import would replace the list and drop the cards
    // added to it so far.
    await queryClient.cancelQueries({ queryKey: key });
    const created = createdIn(bookKeyOf(book));
    let result: ImportResult;
    try {
      result = await runImport(auth, book.href, plan, cards, {
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
      });
    } catch {
      setImportState({ phase: "error", message: t("import_failed_generic") });
      return;
    }
    setImportState({ phase: "done", result, skipped: skipped.size });
    // A refetch that started during the import may have missed some cards.
    void queryClient.invalidateQueries({ queryKey: key });
  }

  function bookKeyOf(book: { href: string }): string {
    return auth ? contactsKey(auth, book).join("\n") : "";
  }

  function createdIn(bookKey: string): Set<string> {
    const created = imported.current.get(bookKey) ?? new Set<string>();
    imported.current.set(bookKey, created);
    return created;
  }

  function closeImport() {
    setImportState(null);
    setImportBook(null);
  }
  return {
    importState,
    importBook,
    exporting,
    exportBook,
    importFile,
    confirmImport,
    closeImport,
  };
}
