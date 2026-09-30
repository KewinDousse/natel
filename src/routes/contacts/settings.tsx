/**
 * Settings route — display preferences, a child of the /contacts layout like
 * /contacts/new (ADR 019). Page lives in src/components/settings-page.tsx.
 */

import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings-page";

export const Route = createFileRoute("/contacts/settings")({
  component: SettingsPage,
});
