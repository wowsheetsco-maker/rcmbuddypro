import { createFileRoute } from "@tanstack/react-router";
import TdsReportPage from "@/pages/claims/TdsReportPage";

export const Route = createFileRoute("/_authenticated/claims/tds")({
  component: TdsReportPage,
});
