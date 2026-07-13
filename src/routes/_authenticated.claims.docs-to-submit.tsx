import { createFileRoute } from "@tanstack/react-router";
import DocsToSubmitPage from "@/pages/claims/DocsToSubmitPage";

export const Route = createFileRoute("/_authenticated/claims/docs-to-submit")({
  component: DocsToSubmitPage,
});
