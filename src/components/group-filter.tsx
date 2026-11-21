/**
 * GroupFilter — the list's group filter (DESIGN.md "Group filter", ADR 022): a
 * menu pill of the book's groups. Once filtered, the pill names the group (or
 * "No group") and a × goes back to every group.
 */

import { useI18n } from "@/i18n/react";
import { type BookGroup, type GroupChoice, NO_GROUP } from "@/lib/contact-groups";
import { ChoiceMenu } from "./choice-menu";

type GroupFilterProps = {
  groups: BookGroup[];
  /** How many contacts are in no group. */
  noGroupCount: number;
  /** The group shown, NO_GROUP for contacts in none, or null for every contact. */
  selected: GroupChoice | null;
  onSelect: (choice: GroupChoice | null) => void;
};

export function GroupFilter({ groups, noGroupCount, selected, onSelect }: GroupFilterProps) {
  const { t } = useI18n();
  const label =
    selected === null ? t("group_all") : selected === NO_GROUP ? t("group_none") : selected;
  return (
    <ChoiceMenu<GroupChoice | null>
      id="group-menu"
      label={label}
      triggerLabel={t("group_filter_label", { name: label })}
      menuLabel={t("group_filter_menu")}
      sections={[
        [
          { value: null, label: t("group_all") },
          { value: NO_GROUP, label: t("group_none"), count: noGroupCount },
        ],
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
