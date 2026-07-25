import { createFileRoute } from "@tanstack/react-router";
import PaymentAdvicePage from "@/pages/claims/PaymentAdvicePage";

export const Route = createFileRoute("/_authenticated/claims/payment-advice")({
  component: PaymentAdvicePage,
});
