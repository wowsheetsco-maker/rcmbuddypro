import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type PrefKey =
  | "sla_breach"
  | "follow_up_due"
  | "contract_expiry"
  | "claim_aging"
  | "denial_spike"
  | "payment_received";

export interface PrefRow {
  pref_key: PrefKey;
  enabled: boolean;
  channel: string;
}

export const PREF_DEFAULTS: Record<PrefKey, { enabled: boolean; channel: string }> = {
  sla_breach: { enabled: true, channel: "in-app + email" },
  follow_up_due: { enabled: true, channel: "in-app" },
  contract_expiry: { enabled: true, channel: "email" },
  claim_aging: { enabled: false, channel: "in-app" },
  denial_spike: { enabled: false, channel: "email" },
  payment_received: { enabled: true, channel: "in-app" },
};

export function useNotificationPrefs() {
  const { userId } = useAuth();
  const [prefs, setPrefs] = useState<Record<PrefKey, PrefRow>>(() => {
    const out = {} as Record<PrefKey, PrefRow>;
    (Object.keys(PREF_DEFAULTS) as PrefKey[]).forEach((k) => {
      out[k] = { pref_key: k, ...PREF_DEFAULTS[k] };
    });
    return out;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("user_notification_prefs" as never)
        .select("pref_key, enabled, channel")
        .eq("user_id", userId);
      if (cancelled) return;
      if (error) {
        console.error("[prefs] load failed", error);
      } else if (data) {
        setPrefs((cur) => {
          const next = { ...cur };
          for (const row of data as unknown as PrefRow[]) {
            if (row.pref_key in PREF_DEFAULTS) next[row.pref_key] = row;
          }
          return next;
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setPref = useCallback(
    async (key: PrefKey, enabled: boolean) => {
      if (!userId) return;
      const channel = prefs[key]?.channel ?? PREF_DEFAULTS[key].channel;
      setPrefs((cur) => ({ ...cur, [key]: { pref_key: key, enabled, channel } }));
      const { error } = await supabase
        .from("user_notification_prefs" as never)
        .upsert(
          { user_id: userId, pref_key: key, enabled, channel } as never,
          { onConflict: "user_id,pref_key" },
        );
      if (error) {
        console.error("[prefs] upsert failed", error);
        throw error;
      }
    },
    [userId, prefs],
  );

  return { prefs, loading, setPref };
}
