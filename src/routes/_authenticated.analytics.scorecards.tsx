import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Unified Scorecards hub entry point. Redirects to the underlying
 * page based on the `entity` search param, so existing filters and
 * deep-links keep working while the tab bar exposes a single
 * "Scorecards" destination.
 */
export const Route = createFileRoute("/_authenticated/analytics/scorecards")({
  validateSearch: (search: Record<string, unknown>) => ({
    entity: (search.entity as string | undefined) ?? "payer",
  }),
  beforeLoad: ({ search }) => {
    const target =
      search.entity === "corporate"
        ? "/analytics/corporate"
        : search.entity === "staff"
        ? "/analytics/staff-scorecard"
        : "/analytics/payer-scorecard";
    throw redirect({ to: target });
  },
});
