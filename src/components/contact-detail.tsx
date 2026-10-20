/**
 * ContactDetailPane — the right-hand detail pane. Holds the router Outlet so
 * /contacts/$id renders inside it; while no contact is selected it shows a
 * muted empty state. On mobile the pane replaces the list (max-lg:hidden).
 *
 * The pane keeps only scroll/layout chrome: the mobile 56px top bar and the
 * padded content wrapper live in the contact page itself (DESIGN.md "Reading
 * view, top to bottom", item 1), so there is exactly one back mechanism.
 */

import type { ReactNode } from "react";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { Key } from "./keyboard-shortcuts";

type ContactDetailPaneProps = {
  /** True when a /contacts/$id route is active. */
  hasContact: boolean;
  children: ReactNode;
};

export function ContactDetailPane({ hasContact, children }: ContactDetailPaneProps) {
  return (
    <aside
      className={cn("lg:min-h-0 lg:overflow-y-auto lg:bg-muted", !hasContact && "max-lg:hidden")}
    >
      {hasContact ? (
        children
      ) : (
        <div className="mx-auto w-full max-w-[44rem] px-5 pb-10 pt-6 sm:px-8 lg:h-full lg:px-10 lg:pt-10 xl:px-14">
          <EmptyDetail />
        </div>
      )}
    </aside>
  );
}

function EmptyDetail() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 pb-[10vh] text-center lg:h-full">
      <p
        className="font-display text-5xl font-bold leading-none text-leader"
        aria-hidden="true"
        data-logotype
      >
        Natel
      </p>
      <p className="text-sm text-muted-foreground">{t("select_contact")}</p>
      {/* Keys only help where there is a keyboard: the pane shows from lg. */}
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Key>N</Key>
          {t("hint_new_contact")}
        </span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1.5">
          <Key>?</Key>
          {t("hint_shortcuts")}
        </span>
      </p>
    </div>
  );
}
