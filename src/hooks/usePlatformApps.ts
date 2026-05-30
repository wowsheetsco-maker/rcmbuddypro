import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface PlatformApp {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  base_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Master list of products on the platform (Pro, Audit, Training, etc.).
 * Readable by any signed-in user; only platform admins can mutate.
 */
export function usePlatformApps() {
  const [apps, setApps] = useState<PlatformApp[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("platform_apps")
      .select("*")
      .order("name");
    if (error) {
      toast({ title: "Failed to load apps", description: error.message, variant: "destructive" });
    } else {
      setApps((data ?? []) as PlatformApp[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`platform_apps-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_apps" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const upsertApp = useCallback(async (input: Partial<PlatformApp> & { slug: string; name: string }) => {
    const { error } = await supabase
      .from("platform_apps")
      .upsert(input, { onConflict: "slug" });
    if (error) {
      toast({ title: "Could not save app", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "App saved" });
    return true;
  }, []);

  const updateApp = useCallback(async (id: string, patch: Partial<PlatformApp>) => {
    const { error } = await supabase.from("platform_apps").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Could not update app", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  }, []);

  return { apps, loading, refresh, upsertApp, updateApp };
}
