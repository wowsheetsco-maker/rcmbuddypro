import { createFileRoute } from "@tanstack/react-router";
import ZeroCancelledRegisterPage from "@/pages/claims/ZeroCancelledRegisterPage";

export const Route = createFileRoute("/_authenticated/claims/zero-cancelled")({
  component: ZeroCancelledRegisterPage,
});
