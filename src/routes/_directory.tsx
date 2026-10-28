import { createFileRoute, redirect } from "@tanstack/react-router";
import { ContactsScreen } from "@/components/contacts-screen";
import { ToastProvider } from "@/components/ui/toast";
import { IS_DEMO } from "@/lib/demo";
import { useSessionStore } from "@/store/session";

/** The directory's pages, /contacts and /settings: the list beside each of them. */
export const Route = createFileRoute("/_directory")({
  beforeLoad: ({ location }) => {
    if (IS_DEMO && !useSessionStore.getState().auth) {
      useSessionStore.getState().login({ username: "demo" });
    }
    if (!useSessionStore.getState().auth) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: DirectoryRoute,
});

function DirectoryRoute() {
  return (
    <ToastProvider>
      <ContactsScreen />
    </ToastProvider>
  );
}
