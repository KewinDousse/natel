import { Link } from "@tanstack/react-router";
import { useI18n } from "@/i18n/react";
import { bookName } from "@/lib/vcf-file";
import { useBookParam, useSelectedBook } from "@/store/session";
import { DemoMark } from "./demo-notice";
import { buttonClass } from "./ui/button";
import { ArrowLeftIcon } from "./ui/icons";

/**
 * Mobile-only top bar: back to the list on the left, named after the selected
 * book so the user knows which book the page belongs to; on the right, the
 * "Modifier" pill with `onEdit`, else `label` ("Modification", "Paramètres").
 */
export function MobileTopBar({ onEdit, label }: { onEdit?: () => void; label?: string }) {
  const { t } = useI18n();
  const book = useBookParam();
  const selected = useSelectedBook();
  const name = selected ? bookName(selected) : null;
  return (
    <div className="sticky top-0 z-20 flex h-14 items-center border-b bg-muted/95 px-2 backdrop-blur lg:hidden">
      <Link
        {...(book ? { to: "/contacts/$book", params: { book } } : { to: "/contacts" })}
        activeOptions={{ exact: true }}
        aria-label={name === null ? t("back_to_list") : t("back_to_book", { name })}
        className={buttonClass(
          { variant: "ghost" },
          "h-10 min-w-0 shrink gap-1.5 pl-2 pr-3 text-foreground hover:bg-background focus-visible:ring-offset-muted",
        )}
      >
        <ArrowLeftIcon />
        <span className="truncate">{name ?? t("list_label")}</span>
      </Link>
      <DemoMark className="ml-1" />
      {onEdit !== undefined ? (
        <button
          type="button"
          onClick={onEdit}
          className={buttonClass({ size: "sm" }, "ml-auto mr-1 px-4")}
        >
          {t("edit")}
        </button>
      ) : (
        label !== undefined && (
          <span className="ml-auto mr-3 shrink-0 text-sm font-bold text-muted-foreground">
            {label}
          </span>
        )
      )}
    </div>
  );
}
