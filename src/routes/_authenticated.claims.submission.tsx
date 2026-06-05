import { createFileRoute } from "@tanstack/react-router";
import SubmissionTrackerPage from "@/pages/claims/SubmissionTrackerPage";

export const Route = createFileRoute("/_authenticated/claims/submission")({
  component: SubmissionTrackerPage,
});
