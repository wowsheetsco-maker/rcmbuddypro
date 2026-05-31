import { createFileRoute } from "@tanstack/react-router";
import ClaimsPage from "@/pages/ClaimsPage";

export const Route = createFileRoute("/_authenticated/claims/")({
  component: ClaimsPage,
});
