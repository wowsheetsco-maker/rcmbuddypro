import { createFileRoute } from "@tanstack/react-router";
import DenialsPage from "@/pages/claims/DenialsPage";

export const Route = createFileRoute("/_authenticated/claims/denials")({
  component: DenialsPage,
});
