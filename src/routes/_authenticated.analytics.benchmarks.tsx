import { createFileRoute } from "@tanstack/react-router";
import BenchmarksPage from "@/pages/analytics/BenchmarksPage";

export const Route = createFileRoute("/_authenticated/analytics/benchmarks")({
  component: BenchmarksPage,
});
