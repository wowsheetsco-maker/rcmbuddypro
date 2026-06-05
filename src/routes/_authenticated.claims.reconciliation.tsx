import { createFileRoute } from "@tanstack/react-router";
import BankReconciliationPage from "@/pages/claims/BankReconciliationPage";

export const Route = createFileRoute("/_authenticated/claims/reconciliation")({
  component: BankReconciliationPage,
});
