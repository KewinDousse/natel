/**
 * LogoutButton — ghost icon button at the end of the app header. Goes through
 * the /logout route so an unsaved edit can still be kept, then drops the
 * query cache so no contact stays in memory after the session ends.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/i18n/react";
import { useSessionStore } from "@/store/session";

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
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <LogoutIcon />
    </button>
  );
}

function LogoutIcon() {
  return (
    <svg
      className="size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </svg>
  );
}
