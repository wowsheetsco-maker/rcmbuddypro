import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type OrgRole } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

type AuthStatus = "checking" | "authed" | "unauthed";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Where to send unauthenticated visitors. Defaults to /login. */
  loginPath?: string;
  /**
   * Optional list of org Supabase roles allowed to view this subtree.
   * If omitted, any signed-in user may view. If set and the user's role
   * isn't included, they are redirected (default: `/`) and a toast is shown.
   */
  allowedRoles?: OrgRole[];
  /** Where to send users who are signed in but lack the required role. */
  forbiddenPath?: string;
}

/**
 * Build a safe `returnTo` value from the current location.
 *
 * Uses only the path + search + hash (no origin, no protocol). Rejects
 * anything that doesn't start with a single `/`, which blocks open-redirect
 * payloads like `//evil.com` or `https://evil.com`.
 */
function buildReturnTo(pathname: string, search: string, hash: string): string {
  // Normalise pieces. TanStack's `useLocation()` exposes `pathname` (always
  // begins with `/`), `searchStr`/`search` (string including leading `?`),
  // and `hash` (string including leading `#` when present).
  const safePath = pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
  const safeSearch = typeof search === "string" && search.startsWith("?") ? search : "";
  const safeHash = typeof hash === "string" && hash.startsWith("#") ? hash : "";
  return `${safePath}${safeSearch}${safeHash}`;
}

/**
 * Client-side route guard.
 *
 * - Calls `supabase.auth.getSession()` on mount.
 * - While the check is in-flight, renders a full-page spinner.
 * - If no session, redirects to `<loginPath>?returnTo=<path+search+hash>`.
 * - Subscribes to `onAuthStateChange`:
 *     - On `SIGNED_OUT` (or any session loss) shows a "session expired"
 *       toast and redirects to the login page.
 * - If `allowedRoles` is set, also gates on the user's org role from
 *   `AuthContext`. Disallowed users are sent to `forbiddenPath` (default
 *   `/`) with a toast.
 */
export function ProtectedRoute({
  children,
  loginPath = "/login",
  allowedRoles,
  forbiddenPath = "/",
}: ProtectedRouteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userId, orgId, role: orgRole, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<AuthStatus>("checking");
  // Avoid double-toasting in StrictMode / re-mounts.
  const expiredToastShown = useRef(false);
  // Track latest status without re-subscribing the listener.
  const statusRef = useRef<AuthStatus>("checking");
  statusRef.current = status;

  useEffect(() => {
    let cancelled = false;
    const returnTo = buildReturnTo(
      location.pathname,
      // TanStack exposes the serialized search string as `searchStr`.
      (location as unknown as { searchStr?: string }).searchStr ?? "",
      typeof location.hash === "string" ? location.hash : ""
    );

    const goToLogin = () => {
      setStatus("unauthed");
      (navigate as unknown as (opts: {
        to: string;
        replace?: boolean;
        search?: Record<string, string>;
      }) => void)({
        to: loginPath,
        replace: true,
        search: { returnTo },
      });
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setStatus("authed");
      else goToLogin();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      const hadSession = statusRef.current === "authed";

      if (event === "SIGNED_OUT" || !session) {
        // Only surface the "expired" toast when the user *had* a session in
        // this guard instance (otherwise we'd toast on every unauthed
        // page-load). And debounce so re-mounts don't stack toasts.
        if (hadSession && !expiredToastShown.current) {
          expiredToastShown.current = true;
          toast({
            title: "Session expired",
            description: "You've been signed out. Please log in again.",
            variant: "destructive",
          });
        }
        goToLogin();
      } else {
        setStatus("authed");
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // returnTo is captured once on mount on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, loginPath]);

  // Role-gate: only enforce once auth + membership are resolved.
  useEffect(() => {
    if (status !== "authed") return;
    if (!allowedRoles || allowedRoles.length === 0) return;
    if (authLoading) return; // wait for AuthContext to resolve role
    if (orgRole && allowedRoles.includes(orgRole)) return;

    toast({
      title: "Access restricted",
      description: "You don't have permission to view that page.",
      variant: "destructive",
    });
    (navigate as unknown as (opts: { to: string; replace?: boolean }) => void)({
      to: forbiddenPath,
      replace: true,
    });
  }, [status, allowedRoles, authLoading, orgRole, forbiddenPath, navigate]);

  const membershipPending = status === "authed" && !!userId && authLoading;

  const roleCheckPending =
    !!allowedRoles &&
    allowedRoles.length > 0 &&
    (authLoading || !orgRole || !allowedRoles.includes(orgRole));

  if (status !== "authed" || membershipPending || roleCheckPending || (!!userId && !authLoading && !orgId)) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-background"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  return <>{children}</>;
}

export default ProtectedRoute;
