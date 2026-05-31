import { createFileRoute } from "@tanstack/react-router";
import ImportClaimsPage from "@/pages/claims/ImportClaimsPage";

export const Route = createFileRoute("/_authenticated/claims/import")({
  component: ImportClaimsPage,
});
