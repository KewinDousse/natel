import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSessionStore } from "@/store/session";

/**
 * Sign-out as a navigation, so an unsaved edit's blocker gets to ask first:
 * the session is cleared only once the router actually leaves the page.
 */
export const Route = createFileRoute("/logout")({
  beforeLoad: () => {
    useSessionStore.getState().logout();
    throw redirect({ to: "/login", replace: true });
  },
});
