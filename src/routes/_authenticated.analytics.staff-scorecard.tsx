import { createFileRoute } from "@tanstack/react-router";
import StaffScorecardPage from "@/pages/analytics/StaffScorecardPage";

export const Route = createFileRoute("/_authenticated/analytics/staff-scorecard")({
  component: StaffScorecardPage,
});
