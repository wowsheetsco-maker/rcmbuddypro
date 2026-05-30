import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a sorted, de-duplicated list of TPA / Insurance company names
 * pulled from the claims table. Used to populate the Insurer filter
 * dropdown on claim worklists.
 */
export function useInsurerOptions(): { options: string[]; loading: boolean } {
  const [options, setOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("claims")
        .select("tpa_name, insurance_company_name")
        .limit(5000);
      if (cancelled) return;
      const set = new Set<string>();
      for (const r of data ?? []) {
        const t = (r as { tpa_name?: string | null }).tpa_name?.trim();
        const i = (r as { insurance_company_name?: string | null })
          .insurance_company_name?.trim();
        if (t) set.add(t);
        if (i) set.add(i);
      }
      setOptions(Array.from(set).sort((a, b) => a.localeCompare(b)));
      setLoading(false);
    })();

    const ch = supabase
      .channel("insurer-options")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "claims" },
        () => {
          // Cheap debounce — reload on next tick
          void (async () => {
            const { data } = await supabase
              .from("claims")
              .select("tpa_name, insurance_company_name")
              .limit(5000);
            const set = new Set<string>();
            for (const r of data ?? []) {
              const t = (r as { tpa_name?: string | null }).tpa_name?.trim();
              const i = (r as { insurance_company_name?: string | null })
                .insurance_company_name?.trim();
              if (t) set.add(t);
              if (i) set.add(i);
            }
            setOptions(Array.from(set).sort((a, b) => a.localeCompare(b)));
          })();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, []);

  return { options, loading };
}
