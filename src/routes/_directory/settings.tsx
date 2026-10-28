/**
 * Settings route — display preferences, a child of the directory layout like
 * a new contact (ADR 019). Page lives in src/components/settings-page.tsx.
 */

import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings-page";

export const Route = createFileRoute("/_directory/settings")({
  component: SettingsPage,
});
