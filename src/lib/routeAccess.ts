import type { OrgRole } from "@/contexts/AuthContext";

/**
 * Path-prefix → allowed org roles. A request whose pathname starts with
 * `prefix` (matching `/x` and `/x/...` but not `/xyz`) requires the user
 * to have one of the listed org roles. Order matters — first match wins,
 * so list more specific prefixes before broader ones.
 *
 * Mirrors the sidebar's `orgRoles` gates so deep-linking enforces the
 * same access boundary that hides the nav item.
 */
export const ROUTE_ROLE_RULES: ReadonlyArray<{
  prefix: string;
  allowedRoles: OrgRole[];
}> = [
  { prefix: "/analytics", allowedRoles: ["owner", "admin"] },
  { prefix: "/dashboard/executive", allowedRoles: ["owner", "admin"] },
  { prefix: "/settings", allowedRoles: ["owner", "admin"] },
  { prefix: "/providers", allowedRoles: ["owner", "admin"] },
  // Claims workspace: any signed-in org member (owner/admin/member). The
  // ProtectedRoute layer requires the user to have a resolved org membership
  // (gated server-side by has_org_role / is_org_member RLS helpers), so a
  // visitor without a row in organization_members will be bounced even
  // though the role list is permissive.
  { prefix: "/claims/priority", allowedRoles: ["owner", "admin", "member"] },
  { prefix: "/claims/denials", allowedRoles: ["owner", "admin", "member"] },
  { prefix: "/claims/discrepancy", allowedRoles: ["owner", "admin", "member"] },
  { prefix: "/claims/data-quality", allowedRoles: ["owner", "admin"] },
  { prefix: "/claims/import", allowedRoles: ["owner", "admin"] },
  { prefix: "/claims/tds", allowedRoles: ["owner", "admin"] },
  { prefix: "/claims", allowedRoles: ["owner", "admin", "member"] },
];

export function allowedRolesForPath(pathname: string): OrgRole[] | undefined {
  for (const { prefix, allowedRoles } of ROUTE_ROLE_RULES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return allowedRoles;
    }
  }
  return undefined;
}
