import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { allowedRolesForPath } from "@/lib/routeAccess";
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
        {mounted ? <Outlet /> : null}
      </TooltipProvider>
    </ProtectedRoute>
  );
}
