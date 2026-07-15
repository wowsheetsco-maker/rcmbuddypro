import { createFileRoute } from "@tanstack/react-router";
import SubmissionTatPage from "@/pages/analytics/SubmissionTatPage";

export const Route = createFileRoute("/_authenticated/analytics/submission-tat")({
  component: SubmissionTatPage,
});
