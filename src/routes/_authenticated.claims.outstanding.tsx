import { createFileRoute } from "@tanstack/react-router";
import FollowUpEnginePage from "@/pages/communications/FollowUpEnginePage";

export const Route = createFileRoute("/_authenticated/claims/outstanding")({
  component: FollowUpEnginePage,
});
