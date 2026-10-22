import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/react";
import { downloadText, exportFileName } from "@/lib/vcf-file";
import {
  EmptyImportError,
  exportVcf,
  type ImportResult,
  IncompleteExportError,
  importVcf,
  type LoadFullBookResult,
} from "@/queries";
import { contactsKey } from "@/queries/keys";
import { useAuth, useSelectedBook } from "@/store/session";
import { isGroupCard } from "@/vcard";

export type ImportState =
  | { phase: "running"; done: number; total: number }
  | { phase: "done"; result: ImportResult }
  | { phase: "error"; message: string };

export function useBookTransfer() {
  const { t } = useI18n();
  const showToast = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const selectedBook = useSelectedBook();
  const [importState, setImportState] = useState<ImportState | null>(null);
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

  const closeImport = () => setImportState(null);
  return { importState, exporting, exportBook, importFile, closeImport };
}
