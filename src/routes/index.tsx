import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  return (
    <div className="flex items-center justify-center h-full">
      <h1 className="text-2xl font-bold">Natel</h1>
    </div>
  );
}
