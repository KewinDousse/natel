/**
 * The demo build's reminders (ADR 025, DESIGN.md "Demo"): a line under the
 * header, and a small mark in the phone's top bar, which replaces the header.
 * Both render nothing outside the demo build.
 */

import { useI18n } from "@/i18n/react";
import { IS_DEMO } from "@/lib/demo";
import { cn } from "@/lib/utils";

// The one coloured sign of the demo, in the line and in the top bar alike.
const MARK =
  "shrink-0 rounded-full bg-brand-surface px-2 py-0.5 text-caption font-bold text-brand-surface-foreground";

export function DemoMark({ className }: { className?: string }) {
  const { t } = useI18n();
  if (!IS_DEMO) return null;
  return (
    <span data-demo-reminder title={t("demo_notice")} className={cn(MARK, className)}>
      {t("demo_mark")}
    </span>
  );
}

export function DemoNotice() {
  const { t } = useI18n();
  if (!IS_DEMO) return null;
  return (
    <p
      data-demo-reminder
      className="border-b bg-secondary px-4 py-1.5 text-center text-caption text-secondary-foreground lg:px-6"
    >
      <span className={cn(MARK, "mr-2 inline-block")}>{t("demo_mark")}</span>
      {/* Screen readers get the pause the pill gives the eye. */}
      <span className="sr-only">{t("demo_separator")}</span>
      <span>{t("demo_notice")}</span>
    </p>
  );
}
