import { createFileRoute } from "@tanstack/react-router";
import AccessCheckerPage from "@/pages/admin/AccessCheckerPage";

export const Route = createFileRoute("/_authenticated/admin/access-checker")({
  validateSearch: (search: Record<string, unknown>) => ({
    attempted: (search.attempted as string | undefined) ?? undefined,
    required: (search.required as string | undefined) ?? undefined,
  }),
  component: AccessCheckerPage,
});
