/**
 * LogoutButton — ghost icon button at the end of the app header. Goes through
 * the /logout route so an unsaved edit can still be kept, then drops the
 * query cache so no contact stays in memory after the session ends.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/i18n/react";
import { useSessionStore } from "@/store/session";
import { buttonClass } from "./button";
import { LogoutIcon } from "./icons";

export function LogoutButton() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const label = t("logout");

  async function logout() {
    await navigate({ to: "/logout" });
    if (useSessionStore.getState().auth === null) queryClient.clear();
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={logout}
      className={buttonClass({ variant: "ghost", size: "icon" })}
    >
      <LogoutIcon />
    </button>
  );
}
