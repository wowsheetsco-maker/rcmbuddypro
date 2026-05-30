import { usePermission, type Resource, type Action } from "@/hooks/useRolePermissions";

/**
 * Returns true if the currently-acting role can perform `action` on `resource`.
 *
 * Thin wrapper around `usePermission` from useRolePermissions — kept as its
 * own hook so app code reads naturally:
 *   const canExport = useHasPermission("claims", "export");
 */
export function useHasPermission(resource: Resource, action: Action = "view"): boolean {
  return usePermission(resource, action);
}

export default useHasPermission;
