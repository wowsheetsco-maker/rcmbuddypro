import { createFileRoute } from "@tanstack/react-router";
import CorporatePerformancePage from "@/pages/analytics/CorporatePerformancePage";

export const Route = createFileRoute("/_authenticated/analytics/corporate")({
  component: CorporatePerformancePage,
});
