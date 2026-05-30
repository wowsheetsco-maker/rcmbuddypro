// Read/write hospital-wide settings stored in public.app_settings (JSONB).
// Used today for the editable Appeal Letter / Query Reply subject templates.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SubjectTemplateKey =
  | "appeal_letter"
  | "query_reply"
  | "discharge_summary"
  | "insurer_email";

export type SubjectTemplates = Record<SubjectTemplateKey, string>;

/** Defaults — also seeded server-side, but kept here so the UI works even if the row is missing. */
export const DEFAULT_SUBJECT_TEMPLATES: SubjectTemplates = {
  appeal_letter: "Appeal against denial{reason_paren}{amount_dash} · {claim_ref}{patient_dot}",
  query_reply: "Reply to query · {claim_ref}{patient_dot}{insurer_dot}",
  discharge_summary: "Discharge Summary · {patient_or_ref}",
  insurer_email: "{purpose} · Claim {claim_ref}{patient_dot}",
};

/** Tokens the user can use inside a subject template. */
export const SUBJECT_TOKENS: Array<{ token: string; description: string }> = [
  { token: "{claim_ref}",     description: "Claim reference number" },
  { token: "{patient}",       description: "Patient name (raw)" },
  { token: "{patient_dot}",   description: '" · <patient>" only when patient is present' },
  { token: "{patient_or_ref}", description: "Patient name, or claim reference if no patient" },
  { token: "{insurer}",       description: "TPA / Insurer name (raw)" },
  { token: "{insurer_dot}",   description: '" · <insurer>" only when insurer is present' },
  { token: "{amount}",        description: "Denied / outstanding amount in ₹" },
  { token: "{amount_dash}",   description: '" — ₹<amount>" only when amount > 0' },
  { token: "{reason}",        description: "Denial reason (raw)" },
  { token: "{reason_paren}",  description: '" (<reason>)" only when reason is present' },
  { token: "{purpose}",       description: "Email purpose (Insurer Email tool only)" },
];

export function useSubjectTemplates() {
  const [templates, setTemplates] = useState<SubjectTemplates>(DEFAULT_SUBJECT_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { getCurrentOrgId } = await import("@/lib/currentOrg");
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("org_id", getCurrentOrgId())
      .eq("key", "subject_templates")
      .maybeSingle();
    if (data?.value && typeof data.value === "object") {
      setTemplates({ ...DEFAULT_SUBJECT_TEMPLATES, ...(data.value as Partial<SubjectTemplates>) });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const save = useCallback(async (next: SubjectTemplates) => {
    setSaving(true);
    const { getCurrentOrgId } = await import("@/lib/currentOrg");
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { org_id: getCurrentOrgId(), key: "subject_templates", value: next },
        { onConflict: "org_id,key" },
      );
    setSaving(false);
    if (!error) setTemplates(next);
    return error;
  }, []);

  return { templates, loading, saving, refetch, save };
}

/** Render a subject template against a flat token map. Unknown tokens are left as-is. */
export function renderSubjectTemplate(
  template: string,
  tokens: Record<string, string>,
): string {
  return template
    .replace(/\{(\w+)\}/g, (_, k: string) => tokens[k] ?? "")
    .replace(/\s+·\s+·\s+/g, " · ")
    .replace(/\s+·\s*$/g, "")
    .replace(/^\s*·\s+/, "")
    .trim();
}
