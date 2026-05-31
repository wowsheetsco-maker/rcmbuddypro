import { createFileRoute } from "@tanstack/react-router";
import DiscrepancyTrackerPage from "@/pages/claims/DiscrepancyTrackerPage";

export const Route = createFileRoute("/_authenticated/claims/discrepancy")({
  component: DiscrepancyTrackerPage,
});
