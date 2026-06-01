import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface BranchScope {
  /** "all" → user sees every branch in their org; "restricted" → only `branchIds`. */
  mode: "all" | "restricted";
  /** Allowed branch ids when `mode === "restricted"`. Empty array if not loaded. */
  branchIds: string[];
  isLoading: boolean;
}

/**
 * Resolves the current user's branch-scope settings for their active org.
 * Mirrors `organization_members.branch_scope` / `branch_scope_mode`.
 *
 * Components that render branch-aware UI (BranchPicker, claim filters, etc.)
 * should call this to know which branches to surface. The server enforces
 * the same restriction via the `can_access_branch` RLS helper, so this
 * hook is for UX only — never use it as a security boundary.
 */
export function useBranchScope(): BranchScope {
  const { userId, orgId } = useAuth();
  const [scope, setScope] = useState<BranchScope>({
    mode: "all",
    branchIds: [],
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;
    if (!userId || !orgId) {
      setScope({ mode: "all", branchIds: [], isLoading: false });
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .select("branch_scope, branch_scope_mode")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        // Fail-open in UI (RLS still gates data); platform admins land here.
        setScope({ mode: "all", branchIds: [], isLoading: false });
        return;
      }
      const mode = (data.branch_scope_mode as "all" | "restricted") ?? "all";
      setScope({
        mode,
        branchIds: mode === "restricted" ? (data.branch_scope ?? []) : [],
        isLoading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, orgId]);

  return scope;
}
