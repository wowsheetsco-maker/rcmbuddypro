import { createFileRoute } from "@tanstack/react-router";
import IntegrationsPage from "@/pages/settings/IntegrationsPage";

export const Route = createFileRoute("/_authenticated/settings/integrations")({
  component: IntegrationsPage,
});
