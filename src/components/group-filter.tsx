/**
 * GroupFilter — the list's group filter (DESIGN.md "Group filter", ADR 022): a
 * menu pill of the book's groups. Once filtered, the pill names the group and
 * a × goes back to every group.
 */

import { useI18n } from "@/i18n/react";
import type { BookGroup } from "@/lib/contact-groups";
import { ChoiceMenu } from "./choice-menu";

type GroupFilterProps = {
  groups: BookGroup[];
  /** The group shown, or null for every contact. */
  selected: string | null;
  onSelect: (name: string | null) => void;
};

export function GroupFilter({ groups, selected, onSelect }: GroupFilterProps) {
  const { t } = useI18n();
  const label = selected ?? t("group_all");
  return (
    <ChoiceMenu<string | null>
      id="group-menu"
      label={label}
      triggerLabel={t("group_filter_label", { name: label })}
      menuLabel={t("group_filter_menu")}
      sections={[
        [{ value: null, label: t("group_all") }],
        groups.map((group) => ({ value: group.name, label: group.name, count: group.count })),
      ]}
      selected={selected}
      onSelect={onSelect}
      clear={
        selected === null
          ? undefined
          : { label: t("group_filter_clear"), onClear: () => onSelect(null) }
      }
    />
  );
}
