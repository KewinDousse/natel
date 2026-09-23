import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSessionStore } from "@/store/session";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (useSessionStore.getState().auth) throw redirect({ to: "/contacts" });
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
