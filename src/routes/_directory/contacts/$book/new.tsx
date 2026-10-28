/**
 * New contact route — the contact page on a blank card, in edit mode.
 * Page logic lives in src/components/contact-page.tsx.
 */

import { createFileRoute } from "@tanstack/react-router";
import { NewContactPage } from "@/components/contact-page";

export const Route = createFileRoute("/_directory/contacts/$book/new")({
  component: NewContactPage,
});
