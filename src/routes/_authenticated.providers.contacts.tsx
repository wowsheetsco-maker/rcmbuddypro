import { createFileRoute } from "@tanstack/react-router";
import ContactsPage from "@/pages/providers/ContactsPage";

export const Route = createFileRoute("/_authenticated/providers/contacts")({
  component: ContactsPage,
});
