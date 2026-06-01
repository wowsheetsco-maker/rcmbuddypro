import { createFileRoute, Outlet, useLocation, useNavigate as useTanstackNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { allowedRolesForPath } from "@/lib/routeAccess";
import { useAdminSubroles, requiredSubrolesForPath } from "@/hooks/useAdminSubroles";
import { useViewMode } from "@/hooks/useViewMode";
import { useNavigate } from "@/lib/router-compat";

const REDIRECT_GATE = "rcm-mobile-redirected";
const DESKTOP_HOME_ROUTES = new Set<string>(["/", "/dashboard/executive"]);

function isDeepLink(pathname: string): boolean {
  if (pathname === "/m") return false;
  if (DESKTOP_HOME_ROUTES.has(pathname)) return false;
  return pathname.length > 1;
}

function MobileRedirect() {
  const { isMobile, override } = useViewMode();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (override === "desktop") {
      try { sessionStorage.removeItem(REDIRECT_GATE); } catch { /* noop */ }
    }
  }, [override]);

  useEffect(() => {
    if (!isMobile) return;
    if (override === "desktop") return;
    if (location.pathname === "/m") return;
    if (isDeepLink(location.pathname)) return;
    if (!DESKTOP_HOME_ROUTES.has(location.pathname)) return;
    try {
      if (sessionStorage.getItem(REDIRECT_GATE)) return;
      sessionStorage.setItem(REDIRECT_GATE, "1");
    } catch { /* noop */ }
    navigate("/m", { replace: true });
  }, [isMobile, override, location.pathname, navigate]);
  return null;
}

/**
 * Gate admin/settings paths behind admin-subrole assignments.
 * Renders children if the path requires no admin subrole, or if the user
 * holds at least one of the required subroles. Otherwise redirects to
 * the access-checker page, which explains why access was denied.
 */
function AdminSubroleGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const required = requiredSubrolesForPath(location.pathname);
  const { hasAnyOf, isLoading } = useAdminSubroles();
  const tNavigate = useTanstackNavigate();

  useEffect(() => {
    if (!required) return;
    if (isLoading) return;
    if (!hasAnyOf(required)) {
      tNavigate({
        to: "/admin/access-checker",
        search: { attempted: location.pathname, required: required.join(",") },
        replace: true,
      });
    }
  }, [required, isLoading, hasAnyOf, tNavigate, location.pathname]);


  if (required && isLoading) return null;
  if (required && !hasAnyOf(required)) return null;
  return <>{children}</>;
}

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const location = useLocation();
  const allowedRoles = allowedRolesForPath(location.pathname);

  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <MobileRedirect />
        {mounted ? (
          <AdminSubroleGate>
            <Outlet />
          </AdminSubroleGate>
        ) : null}
      </TooltipProvider>
    </ProtectedRoute>
  );
}
