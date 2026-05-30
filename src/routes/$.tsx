import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { allowedRolesForPath } from "@/lib/routeAccess";
import LegacyApp from "../_LegacyApp";

export const Route = createFileRoute("/$")({
  component: ProtectedLegacy,
});

function ProtectedLegacy() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const location = useLocation();
  const allowedRoles = allowedRolesForPath(location.pathname);

  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      {mounted ? <LegacyApp /> : null}
    </ProtectedRoute>
  );
}
