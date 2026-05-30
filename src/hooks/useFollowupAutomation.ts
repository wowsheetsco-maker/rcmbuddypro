// Hook for the Followup Automation configuration stored in
// public.app_settings under key = "followup_automation".
// Holds:
//   • per-pendency-bucket scheduling rules (auto email + WhatsApp toggles, cadence, tone)
//   • custom subject + body templates for the four tones used by the
//     Automatic Followup Mail launcher (formal / urgent / friendly / irdai)

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FollowUpTone } from "@/components/BulkFollowUpComposer";

export type PendencyBucket = "0-15" | "16-30" | "31-60" | "60+";

export interface BucketRule {
  bucket: PendencyBucket;
  enabled: boolean;
  email: boolean;
  whatsapp: boolean;
  tone: FollowUpTone;
  /** how often to nudge in days (0 = once) */
  cadenceDays: number;
}

export interface IrdaiBreachRule {
  enabled: boolean;
  email: boolean;
  whatsapp: boolean;
  tone: FollowUpTone; // typically 'irdai'
  cadenceDays: number;
}

export interface ToneTemplate {
  subject: string;
  body: string;
}

export type ToneTemplates = Record<FollowUpTone, ToneTemplate>;

export interface FollowupAutomationConfig {
  buckets: BucketRule[];
  irdai: IrdaiBreachRule;
  templates: ToneTemplates;
}

export const FOLLOWUP_TOKENS: Array<{ token: string; description: string }> = [
  { token: "{insurer}",     description: "TPA / Insurer name" },
  { token: "{hospital}",    description: "Hospital name" },
  { token: "{claim_count}", description: "Number of claims in this batch" },
  { token: "{total}",       description: "Total outstanding (₹)" },
  { token: "{oldest_days}", description: "Oldest claim age in days" },
  { token: "{breaches}",    description: "SLA-breached claim count" },
  { token: "{summary}",     description: "Numbered claim list" },
];

const DEFAULT_TEMPLATES: ToneTemplates = {
  formal: {
    subject: "Follow-up: Outstanding Claims — {insurer}",
    body:
      "Dear Sir/Madam,\n\nGreetings from the Revenue Cycle Management department of {hospital}.\n\nThis is a formal follow-up regarding {claim_count} outstanding claim(s) pending with your office. The total outstanding amount stands at ₹{total}.\n\nPending Claims Summary:\n{summary}\n\nWe kindly request your urgent attention to process the above-mentioned claims at the earliest. Please find the complete claim-wise breakdown attached as an Excel file.\n\nRegards,\nBilling & Claims Team\n{hospital}",
  },
  urgent: {
    subject: "URGENT: Outstanding Claims Escalation — {insurer}",
    body:
      "Dear Sir/Madam,\n\nThis is an URGENT escalation regarding {claim_count} long-pending claim(s) with {insurer} totalling ₹{total}. The oldest claim is now {oldest_days} days old, well beyond the agreed payment TAT.\n\nPending Claims Summary:\n{summary}\n\nKindly process payment / share UTR details within 48 hours. The complete claim-wise list is attached as Excel.\n\nRegards,\nBilling & Claims Team\n{hospital}",
  },
  friendly: {
    subject: "Quick reminder: Pending Claims — {insurer}",
    body:
      "Hi Team,\n\nHope you're doing well! Just a quick nudge on {claim_count} claim(s) pending with {insurer} — adding up to ₹{total}. The oldest one is around {oldest_days} days now.\n\nPending Claims Summary:\n{summary}\n\nCould you please take a quick look and let us know the status whenever you get a moment?\n\nWarm regards,\nBilling & Claims Team\n{hospital}",
  },
  irdai: {
    subject: "SLA Breach Notice: Outstanding Claims — {insurer}",
    body:
      "Dear Sir/Madam,\n\nThis is a formal notice regarding {breaches} claim(s) from {insurer} that have BREACHED the SLA 30-day claim settlement guideline. Total outstanding on breached claims: ₹{total}.\n\nPending Claims Summary:\n{summary}\n\nPlease remit payment within 7 working days, failing which we will be constrained to file a formal complaint with the SLA grievance redressal cell.\n\nRegards,\nBilling & Claims Team\n{hospital}",
  },
};

export const DEFAULT_FOLLOWUP_AUTOMATION: FollowupAutomationConfig = {
  buckets: [
    { bucket: "0-15",  enabled: true,  email: false, whatsapp: false, tone: "friendly", cadenceDays: 7 },
    { bucket: "16-30", enabled: true,  email: true,  whatsapp: false, tone: "formal",   cadenceDays: 5 },
    { bucket: "31-60", enabled: true,  email: true,  whatsapp: true,  tone: "urgent",   cadenceDays: 3 },
    { bucket: "60+",   enabled: true,  email: true,  whatsapp: true,  tone: "urgent",   cadenceDays: 2 },
  ],
  irdai: { enabled: true, email: true, whatsapp: true, tone: "irdai", cadenceDays: 2 },
  templates: DEFAULT_TEMPLATES,
};

/** Render a template with {token} placeholders. Unknown tokens are left as-is. */
export function renderFollowupTemplate(
  template: string,
  tokens: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    tokens[k] !== undefined && tokens[k] !== null ? String(tokens[k]) : `{${k}}`,
  );
}

export function pickBucketForDays(days: number): PendencyBucket {
  if (days <= 15) return "0-15";
  if (days <= 30) return "16-30";
  if (days <= 60) return "31-60";
  return "60+";
}

export function useFollowupAutomation() {
  const [config, setConfig] = useState<FollowupAutomationConfig>(DEFAULT_FOLLOWUP_AUTOMATION);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { getCurrentOrgId } = await import("@/lib/currentOrg");
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("org_id", getCurrentOrgId())
      .eq("key", "followup_automation")
      .maybeSingle();
    if (data?.value && typeof data.value === "object") {
      const v = data.value as Partial<FollowupAutomationConfig>;
      setConfig({
        buckets: v.buckets ?? DEFAULT_FOLLOWUP_AUTOMATION.buckets,
        irdai: { ...DEFAULT_FOLLOWUP_AUTOMATION.irdai, ...(v.irdai ?? {}) },
        templates: { ...DEFAULT_TEMPLATES, ...(v.templates ?? {}) },
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const save = useCallback(async (next: FollowupAutomationConfig) => {
    setSaving(true);
    const { getCurrentOrgId } = await import("@/lib/currentOrg");
    const { error } = await supabase.from("app_settings").upsert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { org_id: getCurrentOrgId(), key: "followup_automation", value: next as any },
      { onConflict: "org_id,key" },
    );
    setSaving(false);
    if (!error) setConfig(next);
    return error;
  }, []);

  return { config, loading, saving, save, refetch };
}
