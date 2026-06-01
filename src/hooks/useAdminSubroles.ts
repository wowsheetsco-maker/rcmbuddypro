import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPlatformAdmin } from "@/hooks/useIsPlatformAdmin";

export type AdminSubrole =
  | "super_admin"
  | "org_owner"
  | "org_admin"
  | "billing_admin"
  | "compliance_admin"
  | "tech_admin";

export interface AdminSubrolesState {
  subroles: Set<AdminSubrole>;
  isLoading: boolean;
  /** True when the user has at least one admin subrole in the active org. */
  hasAny: boolean;
  has: (sub: AdminSubrole) => boolean;
  hasAnyOf: (subs: AdminSubrole[]) => boolean;
}

/**
 * Loads admin subrole assignments for the current user × active org.
 * Platform admins implicitly receive `super_admin`. The `org_owner` /
 * `org_admin` subroles are backfilled in the DB from
 * `organization_members.role`, so promoting a member through the existing
 * UI keeps the subrole list in sync.
 */
export function useAdminSubroles(): AdminSubrolesState {
  const { userId, orgId } = useAuth();
  const { isPlatformAdmin, isLoading: piLoading } = useIsPlatformAdmin();
  const [subroles, setSubroles] = useState<Set<AdminSubrole>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId || !orgId) {
      setSubroles(new Set());
      setIsLoading(false);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("admin_role_assignments")
        .select("subrole")
        .eq("user_id", userId)
        .eq("org_id", orgId);

      if (cancelled) return;
      const next = new Set<AdminSubrole>();
      if (!error && data) {
        for (const row of data) next.add(row.subrole as AdminSubrole);
      }
      if (isPlatformAdmin) next.add("super_admin");
      setSubroles(next);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, orgId, isPlatformAdmin]);

  return {
    subroles,
    isLoading: isLoading || piLoading,
    hasAny: subroles.size > 0,
    has: (s) => subroles.has(s),
    hasAnyOf: (list) => list.some((s) => subroles.has(s)),
  };
}

/**
 * Path-prefix → allowed admin subroles. Used in conjunction with
 * `ROUTE_ROLE_RULES` (org role gating). Both must pass.
 */
export const ADMIN_ROUTE_SUBROLE_RULES: ReadonlyArray<{
  prefix: string;
  allowed: AdminSubrole[];
}> = [
  { prefix: "/admin/promote", allowed: ["super_admin"] },
  { prefix: "/admin/org-access", allowed: ["super_admin", "org_owner"] },
  { prefix: "/admin/roles-matrix", allowed: ["super_admin", "org_owner", "org_admin"] },
  { prefix: "/admin/control-panel", allowed: ["super_admin", "org_owner", "tech_admin"] },
  { prefix: "/admin/access-checker", allowed: ["super_admin", "org_owner", "org_admin", "billing_admin", "compliance_admin", "tech_admin"] },
  { prefix: "/admin/go-no-go", allowed: ["super_admin", "org_owner"] },
  { prefix: "/admin", allowed: ["super_admin", "org_owner", "org_admin", "billing_admin", "compliance_admin", "tech_admin"] },
  { prefix: "/settings/permissions", allowed: ["super_admin", "org_owner"] },
  { prefix: "/settings/ai-providers", allowed: ["super_admin", "tech_admin"] },
  { prefix: "/settings/integrations", allowed: ["super_admin", "tech_admin"] },
  { prefix: "/settings/users", allowed: ["super_admin", "org_owner", "org_admin", "billing_admin"] },
];

export function requiredSubrolesForPath(pathname: string): AdminSubrole[] | undefined {
  for (const { prefix, allowed } of ADMIN_ROUTE_SUBROLE_RULES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return allowed;
    }
  }
  return undefined;
}
