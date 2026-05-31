import { createFileRoute } from "@tanstack/react-router";
import CashFlowPage from "@/pages/analytics/CashFlowPage";

export const Route = createFileRoute("/_authenticated/analytics/cash-flow")({
  component: CashFlowPage,
});
