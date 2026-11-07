import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useI18n } from "@/i18n/react";
import { APP_VERSION } from "@/lib/app-info";
import { compareVersions } from "@/lib/release-version";
import { useCheckUpdates, useUpdates } from "@/queries/useUpdates";
import { useUpdateNotice } from "@/store/update-notice";
import { buttonClass, FOCUS_RING } from "./ui/button";

/** The known release when it is newer than this build. */
function useNewerRelease() {
  const { data } = useUpdates();
  return data?.version && data.releaseUrl && compareVersions(data.version, APP_VERSION) > 0
    ? { version: data.version, releaseUrl: data.releaseUrl }
    : null;
}

/** True for a newer, non-ignored release later than the last one the settings showed. */
export function useUpdateBadge(): boolean {
  const release = useNewerRelease();
  const { ignored, seen } = useUpdateNotice();
  return (
    release !== null &&
    release.version !== ignored &&
    (seen === null || compareVersions(release.version, seen) > 0)
  );
}

/** A dot on the settings gear; the link's label carries it for screen readers. */
export function UpdateBadge() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-1.5 right-1.5 size-2 rounded-full bg-foreground ring-2 ring-background group-hover:ring-muted"
    />
  );
}

/**
 * The settings' release status: a highlighted block for a newer release not
 * ignored, otherwise a line linking to the latest known release.
 */
export function UpdateStatus() {
  const { t } = useI18n();
  const { data, isError } = useUpdates();
  const check = useCheckUpdates();
  const release = useNewerRelease();
  const { ignored, ignore, see } = useUpdateNotice();
  const latestRef = useRef<HTMLAnchorElement>(null);
  const newer = release?.version;
  const highlighted = release !== null && release.version !== ignored;

  useEffect(() => {
    if (newer) see(newer);
  }, [newer, see]);

  let checkStatus = "";
  if (check.isPending) {
    checkStatus = t("update_checking");
  } else if (check.isError) {
    checkStatus = t(
      check.error.message === "Update check rate limited"
        ? "update_check_wait"
        : "update_check_failed",
    );
  } else if (check.isSuccess && check.data.enabled) {
    checkStatus = check.data.version
      ? compareVersions(check.data.version, APP_VERSION) > 0
        ? t("update_available", { version: check.data.version })
        : t("update_current")
      : t("update_check_failed");
  }

  return (
    <>
      {highlighted && (
        <div className="space-y-2 rounded-md border bg-muted px-4 py-3 lg:bg-background text-sm">
          <p className="font-bold">{t("update_available", { version: release.version })}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <a
              href={release.releaseUrl}
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
                // Focus the line that replaces the block, not the page.
                flushSync(() => ignore(release.version));
                latestRef.current?.focus();
              }}
            >
              {t("update_ignore")}
            </button>
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        {t(
          data?.enabled === false
            ? "update_disabled"
            : data?.enabled && !isError
              ? "update_enabled"
              : "update_unavailable",
        )}
        {data?.version && !highlighted && (
          <>
            {" "}
            <a
              ref={latestRef}
              href={data.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline underline-offset-2 ${FOCUS_RING}`}
            >
              {t("update_latest", { version: data.version })}
            </a>
          </>
        )}
      </p>
      {data?.enabled !== false && (
        <div className="space-y-2">
          <button
            type="button"
            className={buttonClass({ variant: "outline", size: "sm" })}
            aria-disabled={check.isPending}
            onClick={() => {
              if (!check.isPending) check.mutate();
            }}
          >
            {t(check.isPending ? "update_checking" : "update_check")}
          </button>
          <p role="status" className="text-sm text-muted-foreground">
            {checkStatus}
          </p>
        </div>
      )}
    </>
  );
}
