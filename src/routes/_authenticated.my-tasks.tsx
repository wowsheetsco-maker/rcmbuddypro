import { createFileRoute } from "@tanstack/react-router";
import MyTasksPage from "@/pages/MyTasksPage";

export const Route = createFileRoute("/_authenticated/my-tasks")({
  component: MyTasksPage,
});
