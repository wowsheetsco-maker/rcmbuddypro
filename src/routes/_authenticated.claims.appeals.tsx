import { createFileRoute } from "@tanstack/react-router";
import AppealsTrackerPage from "@/pages/claims/AppealsTrackerPage";

export const Route = createFileRoute("/_authenticated/claims/appeals")({
  component: AppealsTrackerPage,
});
