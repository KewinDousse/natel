/**
 * The demo build's reminders (ADR 025, DESIGN.md "Demo"): a line under the
 * header, and a small mark in the phone's top bar, which replaces the header.
 * Both render nothing outside the demo build.
 */

import { useI18n } from "@/i18n/react";
import { IS_DEMO } from "@/lib/demo";
import { cn } from "@/lib/utils";
import { InfoIcon } from "./ui/icons";

export function DemoMark({ className }: { className?: string }) {
  const { t } = useI18n();
  if (!IS_DEMO) return null;
  return (
    <span
      title={t("demo_notice")}
      className={cn(
        "shrink-0 rounded-full bg-secondary px-2 py-0.5 text-caption font-bold text-foreground",
        className,
      )}
    >
      {t("demo_mark")}
    </span>
  );
}

export function DemoNotice() {
  const { t } = useI18n();
  if (!IS_DEMO) return null;
  return (
    <p className="border-b bg-secondary px-4 py-1.5 text-center text-caption text-secondary-foreground lg:px-6">
      <InfoIcon className="mr-1.5 inline size-3.5 -translate-y-px text-foreground" />
      {t("demo_notice")}
    </p>
  );
}
