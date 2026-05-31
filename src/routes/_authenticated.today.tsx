import { createFileRoute } from "@tanstack/react-router";
import TodaysWorklistPage from "@/pages/TodaysWorklistPage";

export const Route = createFileRoute("/_authenticated/today")({
  component: TodaysWorklistPage,
});
