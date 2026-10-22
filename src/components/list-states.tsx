/** What the list pane shows in place of contacts: loading, a failure, an empty book. */

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useRef } from "react";
import { useSignOut } from "@/hooks/use-sign-out";
import { useI18n } from "@/i18n/react";
import { cn } from "@/lib/utils";
import { buttonClass } from "./ui/button";
import { PlusIcon, UploadIcon } from "./ui/icons";

export function StateBox({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="font-display text-3xl font-bold leading-tight text-balance">{title}</p>
      {hint && (
        <p className="mx-auto mt-2 max-w-xs text-sm leading-snug text-muted-foreground">{hint}</p>
      )}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function SignInAgain() {
  const { t } = useI18n();
  const signOut = useSignOut();
  return (
    <button type="button" onClick={() => void signOut()} className={buttonClass()}>
      {t("sign_in_again")}
    </button>
  );
}

/** A new book's first screen: what to do with it. */
export function EmptyBook({ onImport }: { onImport?: (file: File) => void }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <StateBox title={t("book_empty")} hint={t("book_empty_hint")}>
      <Link to="/contacts/new" className={buttonClass({}, "pl-3")}>
        <PlusIcon className="size-4" />
        {t("new_contact")}
      </Link>
      {onImport && (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={buttonClass({ variant: "outline" }, "pl-3")}
          >
            <UploadIcon />
            {t("import_vcf")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".vcf,text/vcard,text/x-vcard"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onImport(file);
            }}
          />
        </>
      )}
    </StateBox>
  );
}

/** Rows standing in for the book while it loads. */
export function ListSkeleton() {
  const { t } = useI18n();
  const widths = ["w-40", "w-28", "w-36", "w-44", "w-32", "w-24", "w-48", "w-20"];
  return (
    <div className="pt-12">
      <p role="status" className="sr-only">
        {t("loading_contacts")}
      </p>
      <div className="grid grid-cols-[2.75rem_1fr] sm:grid-cols-[3rem_1fr]">
        <span aria-hidden="true" />
        <ul aria-hidden="true" className="animate-pulse">
          {widths.map((width) => (
            <li
              key={width}
              className="flex min-h-[3.5rem] items-center gap-3 px-2 sm:min-h-[3.25rem]"
            >
              <span className="size-10 shrink-0 rounded-lg bg-muted" />
              <span className={cn("h-3.5 rounded-full bg-muted", width)} />
              <span className="ml-auto hidden h-3.5 w-24 rounded-full bg-muted sm:block" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
