import { createFileRoute } from "@tanstack/react-router";

/** No book named: the screen opens the selected one, else the first (ContactsScreen). */
export const Route = createFileRoute("/_directory/contacts/")({});
