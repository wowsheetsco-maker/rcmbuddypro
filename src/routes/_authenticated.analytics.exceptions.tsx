import { createFileRoute } from "@tanstack/react-router";
import ExecutiveExceptionsPage from "@/pages/analytics/ExecutiveExceptionsPage";

export const Route = createFileRoute("/_authenticated/analytics/exceptions")({
  component: ExecutiveExceptionsPage,
});
