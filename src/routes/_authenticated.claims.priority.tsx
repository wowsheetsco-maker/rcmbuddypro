import { createFileRoute } from "@tanstack/react-router";
import PriorityWorklistPage from "@/pages/claims/PriorityWorklistPage";

export const Route = createFileRoute("/_authenticated/claims/priority")({
  component: PriorityWorklistPage,
});
