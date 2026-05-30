import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ReminderScope = "tpa" | "global";
export type ReminderCadence =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "every_n_days";

export interface ReminderSchedule {
  id: string;
  name: string;
  scope: ReminderScope;
  tpa_name: string | null;
  aging_bucket: string | null;
  cadence: ReminderCadence;
  every_n_days: number | null;
  day_of_week: number | null;
  day_of_month: number | null;
  send_hour: number;
  send_minute: number;
  include_pending: boolean;
  include_discrepancies: boolean;
  include_irdai_breaches: boolean;
  include_denied: boolean;
  include_aging_summary: boolean;
  min_outstanding: number;
  recipient_email_override: string | null;
  cc_emails_override: string | null;
  subject_template: string | null;
  body_template: string | null;
  attach_excel: boolean;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderRun {
  id: string;
  schedule_id: string | null;
  schedule_name: string | null;
  tpa_name: string | null;
  recipient_email: string | null;
  cc_emails: string[] | null;
  trigger_kind: string;
  claim_count: number;
  discrepancy_count: number;
  irdai_breach_count: number;
  total_outstanding: number;
  oldest_claim_days: number | null;
  status: "queued" | "sent" | "failed" | "skipped";
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

export function useReminderSchedules() {
  const [schedules, setSchedules] = useState<ReminderSchedule[]>([]);
  const [runs, setRuns] = useState<ReminderRun[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase
        .from("reminder_schedules")
        .select("*")
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("reminder_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setSchedules((s ?? []) as ReminderSchedule[]);
    setRuns((r ?? []) as ReminderRun[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const ch = supabase
      .channel("reminder_schedules-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminder_schedules" },
        () => reload(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminder_runs" },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [reload]);

  const upsert = useCallback(
    async (input: Partial<ReminderSchedule> & { name: string }) => {
      const { id, ...rest } = input;
      // Strip undefined keys so we don't overwrite columns with NULL by mistake.
      const payload = Object.fromEntries(
        Object.entries(rest).filter(([, v]) => v !== undefined),
      ) as Partial<ReminderSchedule> & { name: string };
      if (id) {
        const { error } = await supabase
          .from("reminder_schedules")
          .update(payload)
          .eq("id", id);
        if (error) {
          toast.error("Could not save rule", { description: error.message });
          return false;
        }
        toast.success("Reminder rule updated");
      } else {
        const { getCurrentOrgId } = await import("@/lib/currentOrg");
        const { error } = await supabase
          .from("reminder_schedules")
          .insert({ ...payload, org_id: getCurrentOrgId() } as never);
        if (error) {
          toast.error("Could not create rule", { description: error.message });
          return false;
        }
        toast.success("Reminder rule created");
      }
      return true;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("reminder_schedules")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Could not delete", { description: error.message });
      return false;
    }
    toast.success("Rule removed");
    return true;
  }, []);

  const toggleActive = useCallback(
    async (id: string, is_active: boolean) => {
      const { error } = await supabase
        .from("reminder_schedules")
        .update({ is_active })
        .eq("id", id);
      if (error) toast.error("Could not toggle", { description: error.message });
    },
    [],
  );

  const runNow = useCallback(async (id: string) => {
    toast.info("Running rule now…");
    const { data, error } = await supabase.functions.invoke(
      "dispatch-tpa-reminders",
      { body: {}, method: "POST" } as never,
    ).catch((e) => ({ data: null, error: e }));
    // Fall back to direct fetch with id query param for force-run
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dispatch-tpa-reminders?id=${id}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: "{}",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json?.error ?? `HTTP ${resp.status}`);
      const sent = (json?.results ?? []).reduce(
        (a: number, b: { sent?: number }) => a + (b.sent ?? 0),
        0,
      );
      toast.success(`Dispatched · ${sent} email(s) sent`);
      await reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast.error("Run failed", { description: msg });
    }
    void data; void error;
  }, [reload]);

  return {
    schedules,
    runs,
    loading,
    reload,
    upsert,
    remove,
    toggleActive,
    runNow,
  };
}
