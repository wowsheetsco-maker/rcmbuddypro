import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true if the current signed-in user is listed in `platform_admins`.
 * Uses the existing `is_platform_admin()` SQL function via RPC.
 */
export function useIsPlatformAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("is_platform_admin");
        if (cancelled) return;
        if (error) {
          console.warn("[useIsPlatformAdmin] rpc error", error.message);
          setIsAdmin(false);
        } else {
          setIsAdmin(Boolean(data));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { isAdmin, loading };
}
