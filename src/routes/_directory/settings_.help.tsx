import { createFileRoute } from "@tanstack/react-router";
import { HelpPage } from "@/components/help-page";

export const Route = createFileRoute("/_directory/settings_/help")({ component: HelpPage });
