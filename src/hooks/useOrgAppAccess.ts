import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface OrgAppAccessRow {
  id: string;
  org_id: string;
  app_id: string;
  plan: string;
  status: string;
  mrr_inr: number;
  contract_start: string | null;
  contract_end: string | null;
  settings: unknown;
  created_at: string;
  updated_at: string;
}

/**
 * Per-org product entitlements. Reads scoped to members via RLS; mutations
 * scoped to platform admins via RLS. Pass orgId = null to fetch ALL rows
 * (only useful for platform admins).
 */
export function useOrgAppAccess(orgId: string | null) {
  const [rows, setRows] = useState<OrgAppAccessRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("org_app_access").select("*").order("updated_at", { ascending: false });
    if (orgId) q = q.eq("org_id", orgId);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Failed to load access", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as OrgAppAccessRow[]);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`org_app_access-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "org_app_access" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const grant = useCallback(
    async (input: { org_id: string; app_id: string; plan?: string; status?: string; mrr_inr?: number; contract_start?: string | null; contract_end?: string | null }) => {
      const { error } = await supabase
        .from("org_app_access")
        .upsert(
          {
            org_id: input.org_id,
            app_id: input.app_id,
            plan: input.plan ?? "trial",
            status: input.status ?? "active",
            mrr_inr: input.mrr_inr ?? 0,
            contract_start: input.contract_start ?? null,
            contract_end: input.contract_end ?? null,
          },
          { onConflict: "org_id,app_id" },
        );
      if (error) {
        toast({ title: "Could not grant access", description: error.message, variant: "destructive" });
        return false;
      }
      toast({ title: "Access granted" });
      return true;
    },
    [],
  );

  const update = useCallback(async (id: string, patch: Partial<Omit<OrgAppAccessRow, "settings">>) => {
    const { error } = await supabase.from("org_app_access").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Could not update access", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Access updated" });
    return true;
  }, []);

  const revoke = useCallback(async (id: string) => {
    const { error } = await supabase.from("org_app_access").delete().eq("id", id);
    if (error) {
      toast({ title: "Could not revoke", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Access revoked" });
    return true;
  }, []);

  return { rows, loading, refresh, grant, update, revoke };
}
