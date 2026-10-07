/**
 * The pieces the contact page's reading view and edit form share: sections,
 * type labels and menus, and the small buttons of a row.
 */

import type { ReactNode } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import { type Kind, kindOf } from "@/lib/contact-edit";
import { cn } from "@/lib/utils";
import { buttonClass, FOCUS_RING, fieldClass } from "./button";
import { CopyIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";

const KIND_LABELS: Record<Kind, TranslationKey> = {
  cell: "t_cell",
  work: "t_work",
  home: "t_home",
  "": "t_other",
};

export function kindLabelKey(kind: Kind): TranslationKey {
  return KIND_LABELS[kind];
}

/** The label a row's TYPE values read as. */
export function TypeLabel({ types }: { types: readonly string[] }) {
  const { t } = useI18n();
  return <>{t(kindLabelKey(kindOf(types)))}</>;
}

/** What a phone can be, and what an e-mail or an address can be. */
const PHONE_KINDS: Kind[] = ["cell", "work", "home", ""];
const PLACE_KINDS: Kind[] = ["home", "work", ""];

export function TypeSelect({
  field,
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  field: "tel" | "email" | "adr";
  value: Kind;
  onChange: (kind: Kind) => void;
  "aria-label": string;
}) {
  const { t } = useI18n();
  const kinds = field === "tel" ? PHONE_KINDS : PLACE_KINDS;
  // A kind the menu doesn't offer for this field still shows as it is.
  const options = kinds.includes(value) ? kinds : [value, ...kinds];
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value as Kind)}
      className={fieldClass("h-11 px-2.5 text-sm text-muted-foreground lg:text-sm")}
    >
      {options.map((kind) => (
        <option key={kind} value={kind}>
          {t(kindLabelKey(kind))}
        </option>
      ))}
    </select>
  );
}

/**
 * A section of the contact page: a light rule, a 40px title line with an action on
 * its right (the reading view's pencil, the form's "+ Ajouter"), the rows.
 */
export function Section({
  id,
  icon,
  title,
  action,
  children,
  className,
}: {
  id?: string;
  /** Marks the section at a glance, before its title. */
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("group/section border-t pt-1", className)}>
      <div className="flex h-10 items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <span aria-hidden="true" className="text-muted-foreground">
            {icon}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The reading view's pencil: on devices that hover it shows with the
 * section's hover or its own focus; on touch it is always there.
 */
export function SectionEditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        buttonClass({ variant: "ghost", size: "icon-sm" }),
        "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/section:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100",
      )}
    >
      <PencilIcon />
    </button>
  );
}

export function CopyButton({ label, onCopy }: { label: string; onCopy: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onCopy}
      className={buttonClass({ variant: "ghost", size: "icon-sm" })}
    >
      <CopyIcon />
    </button>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(buttonClass({ variant: "ghost", size: "icon" }), "hover:text-destructive")}
    >
      <TrashIcon />
    </button>
  );
}

/** "+ Ajouter …" for a section the form doesn't show yet. */
export function AddPill({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border border-dashed border-input bg-background pl-2.5 pr-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        FOCUS_RING,
        className,
      )}
    >
      <PlusIcon className="size-4" />
      {label}
    </button>
  );
}
