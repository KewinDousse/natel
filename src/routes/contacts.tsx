import { createFileRoute, redirect } from "@tanstack/react-router";
import { ContactsScreen } from "@/components/contacts-screen";
import { ToastProvider } from "@/components/ui/toast";
import { IS_DEMO } from "@/lib/demo";
import { useSessionStore } from "@/store/session";

export const Route = createFileRoute("/contacts")({
  beforeLoad: () => {
    if (IS_DEMO && !useSessionStore.getState().auth) {
      useSessionStore.getState().login({ username: "demo" });
    }
    if (!useSessionStore.getState().auth) throw redirect({ to: "/login" });
  },
  component: ContactsRoute,
});

function ContactsRoute() {
  return (
    <ToastProvider>
      <ContactsScreen />
    </ToastProvider>
  );
}
