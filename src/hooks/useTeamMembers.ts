import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { peekCurrentOrgId } from "@/lib/currentOrg";

/**
 * Returns the set of `app_users.id` for teammates in the current org.
 * Used by the Today worklist "My team only" scope.
 */
export function useTeamMembers() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const orgId = peekCurrentOrgId();
      if (!orgId) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("app_users")
        .select("id")
        .eq("org_id", orgId);
      if (cancelled) return;
      if (!error && data) {
        setIds(new Set(data.map((r) => r.id as string)));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { teamIds: ids, loading };
}
