/**
 * The demo build's reminders (ADR 025, DESIGN.md "Demo"): a small mark next
 * to the wordmark or in the phone's top bar, and a muted line under the
 * header. Both render nothing outside the demo build.
 */

import { useI18n } from "@/i18n/react";
import { IS_DEMO } from "@/lib/demo";
import { cn } from "@/lib/utils";

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
    <p className="border-b px-4 py-1.5 text-center text-caption text-muted-foreground lg:px-6">
      {t("demo_notice")}
    </p>
  );
}
