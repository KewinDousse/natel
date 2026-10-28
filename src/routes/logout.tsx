import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSessionStore } from "@/store/session";

/**
 * Sign-out as a navigation, so an unsaved edit's blocker gets to ask first:
 * the session is cleared only once the router actually leaves the page.
 * When the server doesn't confirm the sign-out, the user goes back to the
 * page they were on, still signed in (useSignOut says so). With `resume`,
 * signing in again returns to that page.
 */
export const Route = createFileRoute("/logout")({
  validateSearch: (search: Record<string, unknown>): { back?: string; resume?: true } => {
    const back = search.back;
    // A path in the app only, never another site. An invalid one is
    // overwritten, since the root passes every param on.
    return {
      back: typeof back === "string" && /^\/(?![/\\])/.test(back) ? back : undefined,
      resume: search.resume === true ? true : undefined,
    };
  },
  beforeLoad: async ({ search }) => {
    if (await useSessionStore.getState().logout()) {
      throw redirect({
        to: "/login",
        search: search.resume ? { redirect: search.back } : {},
        replace: true,
      });
    }
    throw redirect({ href: search.back ?? "/contacts", replace: true });
  },
});
