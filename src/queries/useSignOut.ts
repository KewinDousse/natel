import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useSessionStore } from "@/store/session";

/**
 * Signs out through /logout, so an unsaved edit can still be kept, then
 * drops the query cache so no contact stays in memory after the session.
 */
export function useSignOut(): () => Promise<void> {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async () => {
    await navigate({ to: "/logout" });
    if (useSessionStore.getState().auth === null) queryClient.clear();
  };
}
