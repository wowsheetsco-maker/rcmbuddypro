import type { ReactNode } from "react";
import { useAuth, type OrgRole } from "@/contexts/AuthContext";

interface RoleGateProps {
  /** Roles that may see the children. Empty/undefined = visible to any signed-in user. */
  roles?: OrgRole[];
  /** Optional fallback shown when the user is signed in but lacks the role. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally render a UI section based on the user's org role.
 *
 * - While `AuthContext` is still resolving membership, renders nothing
 *   (prevents a flash of role-restricted content).
 * - If `roles` is omitted, behaves as a no-op wrapper.
 */
export function RoleGate({ roles, fallback = null, children }: RoleGateProps) {
  const { role, isLoading } = useAuth();
  if (!roles || roles.length === 0) return <>{children}</>;
  if (isLoading) return null;
  if (!role || !roles.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}

export default RoleGate;
