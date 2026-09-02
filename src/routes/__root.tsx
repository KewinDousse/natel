import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

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
      <TanStackRouterDevtools />
    </div>
  );
}
