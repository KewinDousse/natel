import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSessionStore } from "@/store/session";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (!useSessionStore.getState().auth) throw redirect({ to: "/login" });
  },
  component: IndexRoute,
});

function IndexRoute() {
  return (
    <div className="flex items-center justify-center h-full">
      <h1 className="text-2xl font-bold">Natel</h1>
    </div>
  );
}
