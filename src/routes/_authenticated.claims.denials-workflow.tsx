import { createFileRoute } from "@tanstack/react-router";
import DenialWorkflowPage from "@/pages/claims/DenialWorkflowPage";

export const Route = createFileRoute("/_authenticated/claims/denials-workflow")({
  component: DenialWorkflowPage,
});
