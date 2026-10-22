import { useQueryClient } from "@tanstack/react-query";
import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import type { Contact } from "@/model/contact";
import {
  type DavAuth,
  type GroupFailure,
  groupDelta,
  type LoadFullBookResult,
  retryGroupFailures,
  writeGroupChanges,
} from "@/queries";
import { contactsKey } from "@/queries/keys";
import { useSelectedBook } from "@/store/session";

export function useContactGroupEdits(
  auth: DavAuth,
  groups: string[],
  groupCards: Contact[],
  editSession: RefObject<number>,
) {
  const queryClient = useQueryClient();
  const selectedBook = useSelectedBook();
  // Group names are edited beside the draft: the base is the names at the
  // start of the edit, the draft the names shown; a save writes the delta.
  const [editGroups, setEditGroups] = useState(groups);
  const [draftGroups, setDraftGroups] = useState(groups);
  const [groupFailures, setGroupFailures] = useState<GroupFailure[]>([]);
  // Group cards whose create failed, by name, until written or dropped: a
  // retry writes the same card again, so a create that did land isn't doubled.
  const groupRetries = useRef(new Map<string, Contact>());
  const delta = useMemo(() => groupDelta(editGroups, draftGroups), [editGroups, draftGroups]);

  // Puts the group cards written (ADR 022) into the book's cached groups.
  const cacheGroupCards = useCallback(
    (written: Contact[]) => {
      if (written.length === 0 || !selectedBook) return;
      queryClient.setQueryData<LoadFullBookResult>(contactsKey(auth, selectedBook), (old) => {
        if (!old) return old;
        const byHref = new Map(old.groups.map((card) => [card.href, card]));
        for (const card of written) byHref.set(card.href, card);
        return { ...old, groups: [...byHref.values()] };
      });
    },
    [auth, selectedBook, queryClient],
  );

  const reset = useCallback((names: string[]) => {
    setEditGroups(names);
    setDraftGroups(names);
    setGroupFailures([]);
    groupRetries.current = new Map();
  }, []);

  const clearFailures = useCallback(() => setGroupFailures([]), []);

  const save = useCallback(
    async (uid: string, pending: typeof delta, session: number) => {
      if (!selectedBook) return false;
      const retries = groupRetries.current;
      const { written, failures } = await writeGroupChanges(
        auth,
        selectedBook.href,
        uid,
        pending,
        groupCards,
        retries,
      );
      cacheGroupCards(written);
      if (session !== editSession.current) return false;
      for (const name of pending.added) retries.delete(name);
      for (const failure of failures)
        if (failure.newCard) retries.set(failure.name, failure.newCard);
      const failedAdded = failures
        .filter((failure) => failure.kind === "add")
        .map((failure) => failure.name);
      const failedRemoved = failures
        .filter((failure) => failure.kind === "remove")
        .map((failure) => failure.name);
      setEditGroups((base) => [
        ...base.filter((name) => !pending.removed.includes(name) || failedRemoved.includes(name)),
        ...pending.added.filter((name) => !failedAdded.includes(name)),
      ]);
      if (failures.length > 0) setGroupFailures(failures);
      return failures.length === 0;
    },
    [auth, selectedBook, groupCards, cacheGroupCards, editSession],
  );

  const overwrite = useCallback(
    async (uid: string, session: number) => {
      // Only what the draft still asks for: a chip taken back since is dropped.
      const wanted = groupFailures.filter((failure) =>
        (failure.kind === "add" ? delta.added : delta.removed).includes(failure.name),
      );
      const { written, remaining } = await retryGroupFailures(
        auth,
        wanted,
        uid,
        groupRetries.current,
      );
      cacheGroupCards(written);
      if (session !== editSession.current) return false;
      const done = wanted.filter(
        (failure) =>
          !remaining.some((other) => other.name === failure.name && other.kind === failure.kind),
      );
      const base = [
        ...editGroups.filter(
          (name) => !done.some((failure) => failure.kind === "remove" && failure.name === name),
        ),
        ...done.filter((failure) => failure.kind === "add").map((failure) => failure.name),
      ];
      setEditGroups(base);
      setGroupFailures(remaining);
      const pending = groupDelta(base, draftGroups);
      return remaining.length === 0 && pending.added.length === 0 && pending.removed.length === 0;
    },
    [auth, groupFailures, delta, editGroups, draftGroups, cacheGroupCards, editSession],
  );

  return {
    draftGroups,
    setDraftGroups,
    groupFailures,
    delta,
    reset,
    clearFailures,
    save,
    overwrite,
  };
}
