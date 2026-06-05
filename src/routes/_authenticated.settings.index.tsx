import { createFileRoute } from "@tanstack/react-router";
import AdminConsolePage from "@/pages/settings/AdminConsolePage";

export const Route = createFileRoute("/_authenticated/settings/")({
  component: AdminConsolePage,
});
