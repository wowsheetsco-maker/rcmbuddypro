import { createFileRoute } from "@tanstack/react-router";
import ArManagementPage from "@/pages/claims/ArManagementPage";

export const Route = createFileRoute("/_authenticated/claims/ar")({
  component: ArManagementPage,
});
