import { useI18n } from "@/i18n/react";
import { APP_VERSION } from "@/lib/app-info";
import { compareVersions } from "@/lib/release-version";
import { useUpdates } from "@/queries/useUpdates";
import { useUpdateNotice } from "@/store/update-notice";
import { buttonClass, FOCUS_RING } from "./ui/button";

export function UpdateNotice({ onDismiss }: { onDismiss?: () => void }) {
  const { t } = useI18n();
  const { data } = useUpdates();
  const { ignored, ignore } = useUpdateNotice();
  const version = data?.version;
  const visible = version && version !== ignored && compareVersions(version, APP_VERSION) > 0;

  return (
    <div aria-live="polite">
      {visible && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-muted px-4 py-2 text-sm lg:px-6">
          <p>{t("update_available", { version })}</p>
          <a
            href={data.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-10 items-center font-bold underline underline-offset-2 ${FOCUS_RING}`}
          >
            {t("update_notes")}
          </a>
          <button
            type="button"
            className={buttonClass({ variant: "ghost", size: "sm" })}
            onClick={() => {
              ignore(version);
              onDismiss?.();
            }}
          >
            {t("update_ignore")}
          </button>
        </div>
      )}
    </div>
  );
}
