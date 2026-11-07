import { useSyncExternalStore } from "react";
import { useI18n } from "@/i18n/react";
import { installWay, subscribeInstall } from "@/lib/app-install";
import { buttonClass } from "./ui/button";

/** Installing Natel as an app, the way this browser offers it; nothing when it offers none. */
export function InstallApp() {
  const { t } = useI18n();
  const way = useSyncExternalStore(subscribeInstall, installWay);
  if (way?.kind === "prompt") {
    return (
      <button
        type="button"
        onClick={() => void way.install()}
        className={buttonClass({ variant: "outline" })}
      >
        {t("install_app")}
      </button>
    );
  }
  if (way?.kind === "share") {
    return <p className="text-sm text-muted-foreground">{t("install_app_share")}</p>;
  }
  return null;
}
