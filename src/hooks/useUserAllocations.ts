import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserTpaAllocation {
  id: string;
  user_id: string;
  provider: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useUserAllocations(userId: string | null) {
  const [allocations, setAllocations] = useState<UserTpaAllocation[]>([]);
  const [allAllocations, setAllAllocations] = useState<UserTpaAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("user_tpa_allocations")
      .select("*")
      .order("provider", { ascending: true });
    const rows = (data ?? []) as UserTpaAllocation[];
    setAllAllocations(rows);
    setAllocations(userId ? rows.filter((r) => r.user_id === userId) : []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let mounted = true;
    void reload();
    const ch = supabase
      .channel(`user_tpa_allocations-changes-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_tpa_allocations" },
        () => { if (mounted) void reload(); },
      )
      .subscribe((status) => {
        if (!mounted) return;
        setRealtimeConnected(status === "SUBSCRIBED");
      });
    return () => {
      mounted = false;
      setRealtimeConnected(false);
      supabase.removeChannel(ch);
    };
  }, [reload]);

  const allocate = useCallback(
    async (uid: string, provider: string) => {
      const { getCurrentOrgId } = await import("@/lib/currentOrg");
      const { error } = await supabase
        .from("user_tpa_allocations")
        .insert({ org_id: getCurrentOrgId(), user_id: uid, provider });
      if (error) {
        if (!error.message.includes("duplicate")) {
          toast.error("Could not allocate", { description: error.message });
        }
        return false;
      }
      return true;
    },
    [],
  );

  const deallocate = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("user_tpa_allocations")
      .delete()
      .eq("id", id);
    if (error) toast.error("Could not remove", { description: error.message });
  }, []);

  return { allocations, allAllocations, loading, realtimeConnected, reload, allocate, deallocate };
}
