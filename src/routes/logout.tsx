import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSessionStore } from "@/store/session";

/**
 * Sign-out as a navigation, so an unsaved edit's blocker gets to ask first:
 * the session is cleared only once the router actually leaves the page.
 * When the server doesn't confirm the sign-out, the user goes back to the
 * page they were on, still signed in (useSignOut says so).
 */
export const Route = createFileRoute("/logout")({
  validateSearch: (search: Record<string, unknown>): { back?: string } => {
    const back = search.back;
    // A path in the app only, never another site.
    return typeof back === "string" && /^\/(?![/\\])/.test(back) ? { back } : {};
  },
  beforeLoad: async ({ search }) => {
    if (await useSessionStore.getState().logout()) {
      throw redirect({ to: "/login", replace: true });
    }
    throw redirect({ href: search.back ?? "/contacts", replace: true });
  },
});
