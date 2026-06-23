import { createFileRoute } from "@tanstack/react-router";
import PayersPage from "@/pages/claims/PayersPage";

export const Route = createFileRoute("/_authenticated/claims/payers")({
  component: PayersPage,
});
