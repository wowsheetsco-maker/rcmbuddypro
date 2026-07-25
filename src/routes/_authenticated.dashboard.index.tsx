import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/pages/Dashboard";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Dashboard — RCMBuddy" },
      {
        name: "description",
        content: "Classic RCMBuddy dashboard for claims, revenue, and RCM performance monitoring.",
      },
      { property: "og:title", content: "Dashboard — RCMBuddy" },
      {
        property: "og:description",
        content: "Classic RCMBuddy dashboard for claims, revenue, and RCM performance monitoring.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});