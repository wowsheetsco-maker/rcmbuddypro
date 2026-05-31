import { createFileRoute } from "@tanstack/react-router";
import PayerScorecardPage from "@/pages/analytics/PayerScorecardPage";

export const Route = createFileRoute("/_authenticated/analytics/payer-scorecard")({
  component: PayerScorecardPage,
});
