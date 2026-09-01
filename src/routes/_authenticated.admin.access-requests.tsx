import { createFileRoute } from "@tanstack/react-router";
import AccessRequestsPage from "@/pages/admin/AccessRequestsPage";

export const Route = createFileRoute("/_authenticated/admin/access-requests")({
  component: AccessRequestsPage,
});
