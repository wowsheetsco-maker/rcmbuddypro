import { createFileRoute } from "@tanstack/react-router";
import RequestAccessPage from "@/pages/RequestAccessPage";

export const Route = createFileRoute("/_authenticated/request-access")({
  component: RequestAccessPage,
});
