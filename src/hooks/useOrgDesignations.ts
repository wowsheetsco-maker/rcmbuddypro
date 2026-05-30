import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getCurrentOrgId } from "@/lib/currentOrg";

export interface OrgDesignation {
  id: string;
  org_id: string;
  label: string;
  created_at: string;
  updated_at: string;
}

export function useOrgDesignations() {
  const [items, setItems] = useState<OrgDesignation[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("org_designations")
      .select("*")
      .order("label", { ascending: true });
    if (error) {
      toast({ title: "Failed to load designations", description: error.message, variant: "destructive" });
    } else {
      setItems((data ?? []) as OrgDesignation[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`org_designations-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "org_designations" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const addDesignation = useCallback(async (label: string): Promise<OrgDesignation | null> => {
    const trimmed = label.trim();
    if (!trimmed) return null;
    const orgId = getCurrentOrgId();
    const { data, error } = await supabase
      .from("org_designations")
      .insert({ org_id: orgId, label: trimmed })
      .select("*")
      .single();
    if (error) {
      // Unique violation = already exists, just return existing
      if (error.code === "23505") {
        const existing = items.find((x) => x.label.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing;
      }
      toast({ title: "Could not add designation", description: error.message, variant: "destructive" });
      return null;
    }
    toast({ title: "Designation added", description: trimmed });
    return data as OrgDesignation;
  }, [items]);

  const removeDesignation = useCallback(async (id: string) => {
    const { error } = await supabase.from("org_designations").delete().eq("id", id);
    if (error) {
      toast({ title: "Could not remove", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  }, []);

  return { items, loading, refresh, addDesignation, removeDesignation };
}
