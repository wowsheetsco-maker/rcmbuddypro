import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Global loading screen for the auth/membership boot phase.
 *
 * Renders a full-page spinner whenever `AuthContext.isLoading` is true
 * AND we have a signed-in user (so `orgId`/`role` are about to populate).
 * For signed-out visitors, children render immediately so the login page
 * is never blocked.
 */
export function GlobalAuthLoader({ children }: { children: ReactNode }) {
  const { userId, isLoading } = useAuth();

  if (userId && isLoading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading your workspace…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default GlobalAuthLoader;
