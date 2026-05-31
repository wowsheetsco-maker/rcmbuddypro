import { createFileRoute } from "@tanstack/react-router";
import PermissionsPage from "@/pages/settings/PermissionsPage";

export const Route = createFileRoute("/_authenticated/settings/permissions")({
  component: PermissionsPage,
});
