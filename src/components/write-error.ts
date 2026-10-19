import type { I18nContextValue } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import { formatMegabytes } from "@/lib/format-size";
import { DavError } from "@/queries";

type Write = "save" | "delete" | "move";

// A move fails with NETWORK or TIMEOUT only on its first read, before any write.
const TRANSPORT_ERROR_KEYS: Record<"NETWORK" | "TIMEOUT", Record<Write, TranslationKey>> = {
  NETWORK: {
    save: "err_save_network",
    delete: "err_delete_network",
    move: "err_move_network",
  },
  TIMEOUT: {
    save: "err_save_timeout",
    delete: "err_delete_timeout",
    move: "err_move_timeout",
  },
};

/** Message for a failed PUT or DELETE other than a 412, which each caller handles. */
export function writeErrorText(
  err: unknown,
  write: Write,
  t: I18nContextValue["t"],
  locale: string,
): string {
  if (err instanceof DavError && (err.code === "NETWORK" || err.code === "TIMEOUT")) {
    return t(TRANSPORT_ERROR_KEYS[err.code][write]);
  }
  if (err instanceof DavError && err.code === "AUTH") return t("err_save_auth");
  if (err instanceof DavError && (err.code === "TOO_LARGE" || err.code === "MAYBE_TOO_LARGE")) {
    const key = err.code === "TOO_LARGE" ? "err_save_too_large" : "err_save_maybe_too_large";
    return t(key, { size: formatMegabytes(err.bytes ?? 0, locale) });
  }
  return t(write === "move" ? "err_move_unexpected" : "err_save_unexpected");
}
