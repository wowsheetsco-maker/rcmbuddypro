import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { UserRole } from "@/hooks/useAppUsers";

/**
 * useMyRoles — the canonical source of truth for "which capability roles
 * does the current user hold in the current org?".
 *
 * Reads from public.user_roles (LAYER 2 — capability). Replaces the older
 * pattern of trusting app_users.role, which is now display-only.
 */
export function useMyRoles() {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) { setRoles([]); setLoading(false); return; }
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid);
    const unique = Array.from(new Set((data ?? []).map((r) => r.role as UserRole)));
    setRoles(unique);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const ch = supabase
      .channel(`user_roles-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => void reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reload]);

  return { roles, loading, reload };
}

export default useMyRoles;
