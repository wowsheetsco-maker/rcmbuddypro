import { createFileRoute } from "@tanstack/react-router";
import ExecutiveDashboard from "@/pages/ExecutiveDashboard";

export const Route = createFileRoute("/_authenticated/dashboard/executive")({
  component: ExecutiveDashboard,
});
