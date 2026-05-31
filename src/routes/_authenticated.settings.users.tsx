import { createFileRoute } from "@tanstack/react-router";
import UsersPage from "@/pages/settings/UsersPage";

export const Route = createFileRoute("/_authenticated/settings/users")({
  component: UsersPage,
});
