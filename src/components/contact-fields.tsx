/**
 * The pieces the contact page's reading view and edit form share: sections,
 * type labels and menus, and the small buttons of a row.
 */

import type { ReactNode } from "react";
import { useI18n } from "@/i18n/react";
import type { TranslationKey } from "@/i18n/setup";
import { type AddressKind, appleBuiltInOf, type Kind, kindOf } from "@/lib/contact-edit";
import { cn } from "@/lib/utils";
import { buttonClass, FOCUS_RING, fieldClass } from "./ui/button";
import { CopyIcon, PencilIcon, PlusIcon, TrashIcon } from "./ui/icons";

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
export function TypeLabel({ types, label }: { types: readonly string[]; label?: string }) {
  const { t } = useI18n();
  return <>{label === undefined ? t(kindLabelKey(kindOf(types))) : appleLabelText(label, t)}</>;
}

const APPLE_LABELS: Record<string, TranslationKey> = {
  home: "t_home",
  work: "t_work",
  other: "t_other",
  mobile: "t_cell",
  iphone: "ab_iphone",
  main: "ab_main",
  homefax: "ab_home_fax",
  workfax: "ab_work_fax",
  otherfax: "ab_other_fax",
  pager: "ab_pager",
  homepage: "ab_homepage",
  mother: "ab_mother",
  father: "ab_father",
  parent: "ab_parent",
  brother: "ab_brother",
  sister: "ab_sister",
  child: "ab_child",
  friend: "ab_friend",
  spouse: "ab_spouse",
  partner: "ab_partner",
  assistant: "ab_assistant",
  manager: "ab_manager",
};

export function appleLabelText(label: string, t: (key: TranslationKey) => string): string {
  const builtIn = appleBuiltInOf(label);
  if (builtIn === undefined) return label;
  const name = builtIn.toLowerCase();
  const key = Object.hasOwn(APPLE_LABELS, name) ? APPLE_LABELS[name] : undefined;
  return key === undefined ? builtIn : t(key);
}

/** What a phone can be, and what an e-mail or an address can be. */
const PHONE_KINDS: Kind[] = ["cell", "work", "home", ""];
const PLACE_KINDS: Kind[] = ["home", "work", ""];

/**
 * A row's type menu. With `custom` (addresses only, ADR 036), it ends with a
 * label of the user's own, which the row then asks for.
 */
export function TypeSelect<K extends AddressKind>({
  field,
  value,
  label,
  custom = false,
  onChange,
  "aria-label": ariaLabel,
}: {
  field: "tel" | "email" | "adr" | "url";
  value: K;
  label?: string;
  custom?: boolean;
  onChange: (kind: K) => void;
  "aria-label": string;
}) {
  const { t } = useI18n();
  const kinds = field === "tel" ? PHONE_KINDS : PLACE_KINDS;
  const shown: AddressKind = value;
  // A kind the menu doesn't offer for this field still shows as it is.
  const options =
    shown === "label" || shown === "custom" || kinds.includes(shown) ? kinds : [shown, ...kinds];
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value as K)}
      className={fieldClass("h-11 px-2.5 text-sm text-muted-foreground lg:text-sm")}
    >
      {label !== undefined && <option value="label">{appleLabelText(label, t)}</option>}
      {options.map((kind) => (
        <option key={kind} value={kind}>
          {t(kindLabelKey(kind))}
        </option>
      ))}
      {custom && <option value="custom">{t("t_custom")}</option>}
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
