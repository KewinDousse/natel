import { createRootRoute, Outlet } from "@tanstack/react-router";
import { lazy } from "react";

export const Route = createRootRoute({
  component: RootRoute,
});

/**
 * Minimal root: no chrome, so the login screen is full-bleed. The app header
 * will be added per route once the directory routes exist.
 */
function RootRoute() {
  return (
    <>
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
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
