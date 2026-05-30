import type { ReactNode } from "react";
import { useHasPermission } from "@/hooks/useHasPermission";
import type { Resource, Action } from "@/hooks/useRolePermissions";

interface PermissionGateProps {
  resource: Resource;
  action?: Action;
  /** Rendered when permission is denied. Defaults to `null` (hide). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally render children based on the acting role's permission for a
 * (resource, action) pair. Renders `fallback` (or nothing) when denied.
 */
export function PermissionGate({
  resource,
  action = "view",
  fallback = null,
  children,
}: PermissionGateProps) {
  const allowed = useHasPermission(resource, action);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

export default PermissionGate;
