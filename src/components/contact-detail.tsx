/**
 * ContactDetailPane — the right-hand detail pane. Holds the router Outlet so
 * /contacts/$id renders inside it; while no contact is selected it shows a
 * muted empty state. On mobile the pane replaces the list (max-lg:hidden) and
 * gets a back bar; the real contact page replaces the stub in the next task.
 */

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";

type ContactDetailPaneProps = {
  /** True when a /contacts/$id route is active. */
  hasContact: boolean;
  children: ReactNode;
};

export function ContactDetailPane({ hasContact, children }: ContactDetailPaneProps) {
  const { t } = useI18n();
  return (
    <aside
      className={cn("lg:min-h-0 lg:overflow-y-auto lg:bg-muted", !hasContact && "max-lg:hidden")}
    >
      {hasContact && (
        <div className="sticky top-0 z-20 flex h-14 items-center border-b bg-muted/95 px-2 backdrop-blur lg:hidden">
          <Link
            to="/contacts"
            activeOptions={{ exact: true }}
            aria-label={t("back_to_list")}
            className="inline-flex h-10 items-center gap-1.5 rounded-full pl-2 pr-3 text-sm font-bold hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted"
          >
            <ChevronLeftIcon />
            <span>{t("list_label")}</span>
          </Link>
        </div>
      )}
      <div className="mx-auto w-full max-w-[44rem] px-5 pb-10 pt-6 sm:px-8 lg:px-10 lg:pt-10 xl:px-14">
        {hasContact ? children : <EmptyDetail />}
      </div>
    </aside>
  );
}

function EmptyDetail() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center lg:min-h-full">
      <p className="font-display text-5xl font-bold leading-none text-leader" aria-hidden="true">
        Natel
      </p>
      <p className="text-sm text-muted-foreground">{t("select_contact")}</p>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      className="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
