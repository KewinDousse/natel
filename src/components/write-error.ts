import type { I18nContextValue } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import { formatMegabytes } from "@/lib/format-size";
import { DavError } from "@/queries";

const NETWORK_ERROR_KEYS: Record<"save" | "delete" | "move", TranslationKey> = {
  save: "err_save_network",
  delete: "err_delete_network",
  move: "err_move_network",
};

/** Message for a failed PUT or DELETE other than a 412, which each caller handles. */
export function writeErrorText(
  err: unknown,
  write: "save" | "delete" | "move",
  t: I18nContextValue["t"],
  locale: string,
): string {
  if (err instanceof DavError && err.code === "NETWORK") {
    return t(NETWORK_ERROR_KEYS[write]);
  }
  if (err instanceof DavError && err.code === "AUTH") return t("err_save_auth");
  if (err instanceof DavError && (err.code === "TOO_LARGE" || err.code === "MAYBE_TOO_LARGE")) {
    const key = err.code === "TOO_LARGE" ? "err_save_too_large" : "err_save_maybe_too_large";
    return t(key, { size: formatMegabytes(err.bytes ?? 0, locale) });
  }
  return t(write === "move" ? "err_move_unexpected" : "err_save_unexpected");
}
