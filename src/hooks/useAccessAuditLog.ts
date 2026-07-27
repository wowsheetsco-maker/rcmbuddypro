import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { AccessAuditRow } from "@/lib/accessAudit";

export interface AuditFilters {
  entity?: string;
  branchId?: string;
  search?: string;
  days?: number;
}

/** Reads the org's access audit trail (RLS scopes it to the caller's org). */
export function useAccessAuditLog(filters: AuditFilters = {}) {
  const { orgId } = useAuth();
  const [rows, setRows] = useState<AccessAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { entity, branchId, days } = filters;

  const refresh = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("access_audit_log")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (entity && entity !== "all") q = q.eq("entity", entity);
    if (branchId && branchId !== "all") q = q.eq("branch_id", branchId);
    if (days && days > 0) {
      const from = new Date(Date.now() - days * 86400000).toISOString();
      q = q.gte("created_at", from);
    }
    const { data } = await q;
    setRows((data ?? []) as AccessAuditRow[]);
    setLoading(false);
  }, [orgId, entity, branchId, days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, refresh };
}

export default useAccessAuditLog;
