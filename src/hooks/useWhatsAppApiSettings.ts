// Per-hospital (org) WhatsApp Business API settings, stored in app_settings.
// Key: "whatsapp_api"  Value: { enabled: boolean }
//
// When enabled, the composer routes sends through the sendWhatsApp server fn
// (Meta Cloud API). When disabled, it falls back to wa.me deep links. The
// env flag VITE_WHATSAPP_API_ENABLED acts as a default if the row is absent.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WhatsAppApiSettings {
  enabled: boolean;
}

export const DEFAULT_WHATSAPP_API_SETTINGS: WhatsAppApiSettings = {
  enabled: import.meta.env.VITE_WHATSAPP_API_ENABLED === "true",
};

const KEY = "whatsapp_api";

export async function fetchWhatsAppApiSettings(): Promise<WhatsAppApiSettings> {
  try {
    const { getCurrentOrgId } = await import("@/lib/currentOrg");
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("org_id", getCurrentOrgId())
      .eq("key", KEY)
      .maybeSingle();
    if (data?.value && typeof data.value === "object") {
      return { ...DEFAULT_WHATSAPP_API_SETTINGS, ...(data.value as Partial<WhatsAppApiSettings>) };
    }
  } catch {
    /* fall through to defaults */
  }
  return DEFAULT_WHATSAPP_API_SETTINGS;
}

export function useWhatsAppApiSettings() {
  const [settings, setSettings] = useState<WhatsAppApiSettings>(DEFAULT_WHATSAPP_API_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setSettings(await fetchWhatsAppApiSettings());
    setLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const save = useCallback(async (next: WhatsAppApiSettings) => {
    setSaving(true);
    const { getCurrentOrgId } = await import("@/lib/currentOrg");
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { org_id: getCurrentOrgId(), key: KEY, value: next as unknown as Record<string, boolean> },
        { onConflict: "org_id,key" },
      );
    setSaving(false);
    if (!error) setSettings(next);
    return error;
  }, []);

  return { settings, loading, saving, refetch, save };
}
