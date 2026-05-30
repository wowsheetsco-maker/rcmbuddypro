// Team digest subscriptions + per-org template config (stored in app_settings).
// Internal status emails: daily / weekly / monthly. Templates editable in UI.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";

export type DigestCadence = "daily" | "weekly" | "monthly";

export interface DigestSubscription {
  id: string;
  app_user_id: string;
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
}

export interface DigestTemplate {
  subject: string;
  body: string;
  format: "html" | "text";
}

export type DigestTemplates = Record<DigestCadence, DigestTemplate>;

export const DIGEST_TOKENS: Array<{ token: string; description: string }> = [
  { token: "{user_name}",        description: "Recipient's name" },
  { token: "{user_role}",        description: "Recipient's role" },
  { token: "{hospital}",         description: "Hospital / org name" },
  { token: "{period}",           description: "Period covered (e.g. Today, Last 7 days)" },
  { token: "{my_open_tasks}",    description: "Number of open follow-ups assigned to user" },
  { token: "{my_overdue}",       description: "Number of overdue follow-ups for user" },
  { token: "{team_outstanding}", description: "Total outstanding ₹ across team" },
  { token: "{team_claims}",      description: "Total open claims across team" },
  { token: "{breaches}",         description: "SLA-breached claims count" },
  { token: "{settled_period}",   description: "Claims settled in this period" },
  { token: "{collected_period}", description: "Total ₹ collected in this period" },
  { token: "{tasks_list}",       description: "Numbered list of today's/this week's tasks" },
  { token: "{kpi_block}",        description: "Pre-formatted KPI block for managers" },
];

export const DEFAULT_DIGEST_TEMPLATES: DigestTemplates = {
  daily: {
    subject: "Your tasks for today — {hospital}",
    format: "html",
    body:
      "Hi {user_name},\n\nHere is your worklist for today as {user_role}.\n\n• Open follow-ups assigned to you: {my_open_tasks}\n• Overdue: {my_overdue}\n• SLA-breached claims to act on: {breaches}\n\nToday's priority tasks:\n{tasks_list}\n\nTeam pulse:\n{kpi_block}\n\n— RCM Buddy",
  },
  weekly: {
    subject: "Weekly team performance — {hospital} ({period})",
    format: "html",
    body:
      "Hi {user_name},\n\nHere is the team performance recap for {period}.\n\n{kpi_block}\n\nThis week's focus:\n{tasks_list}\n\n• Total open claims: {team_claims}\n• Total outstanding: ₹{team_outstanding}\n• SLA breaches: {breaches}\n• Settled this week: {settled_period}\n• Collected: ₹{collected_period}\n\n— RCM Buddy",
  },
  monthly: {
    subject: "Monthly RCM scorecard — {hospital} ({period})",
    format: "html",
    body:
      "Hi {user_name},\n\nHere is the monthly RCM performance for {period}.\n\n{kpi_block}\n\n• Open claims: {team_claims}\n• Outstanding: ₹{team_outstanding}\n• Settled this month: {settled_period}\n• Collected: ₹{collected_period}\n• SLA breaches at month-end: {breaches}\n\nKey priorities for next month:\n{tasks_list}\n\n— RCM Buddy",
  },
};

const KEY = "team_digest_templates";

export function useDigestTemplates() {
  const [templates, setTemplates] = useState<DigestTemplates>(DEFAULT_DIGEST_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("org_id", getCurrentOrgId())
      .eq("key", KEY)
      .maybeSingle();
    if (data?.value && typeof data.value === "object") {
      const v = data.value as Partial<DigestTemplates>;
      setTemplates({
        daily:   { ...DEFAULT_DIGEST_TEMPLATES.daily,   ...(v.daily ?? {}) },
        weekly:  { ...DEFAULT_DIGEST_TEMPLATES.weekly,  ...(v.weekly ?? {}) },
        monthly: { ...DEFAULT_DIGEST_TEMPLATES.monthly, ...(v.monthly ?? {}) },
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const save = useCallback(async (next: DigestTemplates) => {
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { org_id: getCurrentOrgId(), key: KEY, value: next as any },
      { onConflict: "org_id,key" },
    );
    setSaving(false);
    if (!error) setTemplates(next);
    return error;
  }, []);

  return { templates, loading, saving, save, refetch };
}

// ---------- Per-cadence rules (enabled + role recipients + manager rollup) ----------

export interface DigestCadenceRule {
  enabled: boolean;
  roles: string[];           // app_user.role values that should receive this cadence
  managerRollup: boolean;    // include managers (RCM Manager / Hospital Admin / CFO View / Super Admin) on a roll-up
}
export type DigestRules = Record<DigestCadence, DigestCadenceRule>;

export const MANAGER_ROLES = ["RCM Manager", "Hospital Admin", "CFO View", "Super Admin"];

export const DEFAULT_DIGEST_RULES: DigestRules = {
  daily:   { enabled: true,  roles: ["Billing Executive"],                                   managerRollup: false },
  weekly:  { enabled: true,  roles: ["RCM Manager", "Hospital Admin", "CFO View"],           managerRollup: true  },
  monthly: { enabled: true,  roles: ["RCM Manager", "Hospital Admin", "CFO View", "Super Admin"], managerRollup: true },
};

const RULES_KEY = "team_digest_rules";

export function useDigestRules() {
  const [rules, setRules] = useState<DigestRules>(DEFAULT_DIGEST_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("org_id", getCurrentOrgId())
      .eq("key", RULES_KEY)
      .maybeSingle();
    if (data?.value && typeof data.value === "object") {
      const v = data.value as Partial<DigestRules>;
      setRules({
        daily:   { ...DEFAULT_DIGEST_RULES.daily,   ...(v.daily   ?? {}) },
        weekly:  { ...DEFAULT_DIGEST_RULES.weekly,  ...(v.weekly  ?? {}) },
        monthly: { ...DEFAULT_DIGEST_RULES.monthly, ...(v.monthly ?? {}) },
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const save = useCallback(async (next: DigestRules) => {
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { org_id: getCurrentOrgId(), key: RULES_KEY, value: next as any },
      { onConflict: "org_id,key" },
    );
    setSaving(false);
    if (!error) setRules(next);
    return error;
  }, []);

  return { rules, loading, saving, save, refetch };
}

export function useDigestSubscriptions() {
  const [subs, setSubs] = useState<DigestSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("team_digest_subscriptions" as never)
      .select("id, app_user_id, daily, weekly, monthly")
      .eq("org_id", getCurrentOrgId());
    setSubs((data as unknown as DigestSubscription[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const upsert = useCallback(async (
    app_user_id: string,
    patch: { daily?: boolean; weekly?: boolean; monthly?: boolean },
  ) => {
    const existing = subs.find((s) => s.app_user_id === app_user_id);
    const row = {
      org_id: getCurrentOrgId(),
      app_user_id,
      daily: patch.daily ?? existing?.daily ?? false,
      weekly: patch.weekly ?? existing?.weekly ?? false,
      monthly: patch.monthly ?? existing?.monthly ?? false,
    };
    const { error } = await supabase
      .from("team_digest_subscriptions" as never)
      .upsert(row as never, { onConflict: "org_id,app_user_id" });
    if (!error) await refetch();
    return error;
  }, [subs, refetch]);

  return { subs, loading, upsert, refetch };
}
