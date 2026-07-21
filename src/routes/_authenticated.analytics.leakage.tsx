import { createFileRoute } from "@tanstack/react-router";
import LeakageDashboardPage from "@/pages/analytics/LeakageDashboardPage";

export const Route = createFileRoute("/_authenticated/analytics/leakage")({
  component: LeakageDashboardPage,
});
