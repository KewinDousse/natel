import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createRootRoute({
  component: RootRoute,
});

function RootRoute() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-4 py-3">
        <Link to="/" className="text-lg font-semibold">
          Natel
        </Link>
      </header>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </div>
  );
}

function TanStackRouterDevtools() {
  const Devtools = lazy(() =>
    import("@tanstack/react-router-devtools").then((m) => ({
      default: m.TanStackRouterDevtools,
    })),
  );
  return <Devtools />;
}
