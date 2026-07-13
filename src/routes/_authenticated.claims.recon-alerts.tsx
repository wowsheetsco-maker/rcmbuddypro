import { createFileRoute } from "@tanstack/react-router";
import ReconciliationAlertsPage from "@/pages/claims/ReconciliationAlertsPage";

export const Route = createFileRoute("/_authenticated/claims/recon-alerts")({
  component: ReconciliationAlertsPage,
});
