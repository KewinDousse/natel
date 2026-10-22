import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/react";
import { useSessionStore } from "@/store/session";

/**
 * Signs out through /logout, so an unsaved edit can still be kept, then
 * drops the query cache so no contact stays in memory after the session.
 * A sign-out the server didn't confirm leaves the user on the page, told so.
 */
export function useSignOut(): () => Promise<void> {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const showToast = useToast();
  const { t } = useI18n();
  return async () => {
    // Only this attempt's outcome counts, not one from a direct visit to /logout.
    useSessionStore.setState({ signOutFailed: false });
    await navigate({ to: "/logout", search: { back: router.state.location.href } });
    const { auth, signOutFailed } = useSessionStore.getState();
    if (auth === null) queryClient.clear();
    else if (signOutFailed) showToast(t("sign_out_failed"));
  };
}
