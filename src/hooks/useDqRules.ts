// Hook over the dq_rules table — loads the "default" ruleset and exposes a
// save() to update thresholds. Falls back to DEFAULT_DQ_RULES if the row is
// missing (e.g. during initial migration).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_DQ_RULES, type DqRules } from "@/lib/dataQualityEngine";

const RULESET_NAME = "default";

export function useDqRules() {
  const [rules, setRules] = useState<DqRules>(DEFAULT_DQ_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dq_rules")
      .select("config")
      .eq("name", RULESET_NAME)
      .maybeSingle();
    if (!error && data?.config) {
      setRules({ ...DEFAULT_DQ_RULES, ...(data.config as Partial<DqRules>) });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (next: DqRules) => {
      setSaving(true);
      const { error } = await supabase
        .from("dq_rules")
        .update({ config: next as unknown as Record<string, number> })
        .eq("name", RULESET_NAME);
      if (!error) setRules(next);
      setSaving(false);
      return { error };
    },
    [],
  );

  return { rules, loading, saving, reload: load, save };
}
