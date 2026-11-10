/**
 * Each book's group format, chosen in the question or in settings (ADR 052).
 * Kept in this browser with the display preferences, per account and book,
 * under a hash: the username and the book's address never appear in plain
 * text. The hash only keeps them out of sight; it protects nothing.
 */
import { create } from "zustand";
import { storeChoiceIn, storedChoices } from "@/i18n/preferences";
import { GROUP_FORMATS, type GroupFormat } from "@/lib/group-format";
import { fnv1a } from "@/lib/hash";

const FIELD = "groupFormats";

/** The stored key of a book of an account. */
export function bookFormatKey(username: string, bookHref: string): string {
  return fnv1a(`${username}\n${bookHref}`);
}

type GroupFormatsState = {
  formats: Record<string, GroupFormat>;
  /** Store a book's format, or clear it with null (Automatic). */
  setFormat: (key: string, format: GroupFormat | null) => void;
};

export const useGroupFormats = create<GroupFormatsState>()((set) => ({
  formats: storedChoices(FIELD, GROUP_FORMATS),
  setFormat: (key, format) => {
    storeChoiceIn(FIELD, key, format);
    set((state) => {
      const formats = { ...state.formats };
      if (format === null) delete formats[key];
      else formats[key] = format;
      return { formats };
    });
  },
}));

/** The format chosen for a book of an account, or null for Automatic. */
export function useBookFormat(username: string, bookHref: string | undefined) {
  const key = bookHref === undefined ? null : bookFormatKey(username, bookHref);
  const format = useGroupFormats((state) => (key === null ? null : (state.formats[key] ?? null)));
  const setFormat = useGroupFormats((state) => state.setFormat);
  return { format, key, setFormat };
}
