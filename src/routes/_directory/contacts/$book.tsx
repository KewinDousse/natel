import { createFileRoute } from "@tanstack/react-router";
import { SelectedBookOutlet } from "@/components/contacts-screen";

/** A book's pages, `$book` being `bookParam`. */
export const Route = createFileRoute("/_directory/contacts/$book")({
  component: () => <SelectedBookOutlet book={Route.useParams().book} />,
});
