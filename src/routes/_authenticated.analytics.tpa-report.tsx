import { createFileRoute } from "@tanstack/react-router";
import TpaReportPage from "@/pages/analytics/TpaReportPage";

export const Route = createFileRoute("/_authenticated/analytics/tpa-report")({
  component: TpaReportPage,
});
