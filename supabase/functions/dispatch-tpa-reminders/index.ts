// Cron-triggered dispatcher for the Reminder Automation engine.
// Walks active reminder_schedules whose next_run_at is due (or null),
// builds the claim payload (pending / discrepancies / IRDAI / denied based
// on toggles) and invokes send-outstanding-reminder to actually send the
// email (which already attaches an Excel of the claims). Logs every run
// into reminder_runs and reschedules next_run_at based on the cadence.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyCronSecret } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const IST_OFFSET_MIN = 330; // +05:30

interface Schedule {
  id: string;
  name: string;
  scope: string;
  tpa_name: string | null;
  aging_bucket: string | null;
  cadence: string;
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
}

interface ClaimRow {
  id: string;
  claim_number: string;
  patient_name: string;
  policy_number: string | null;
  date_of_admission: string | null;
  date_of_discharge: string | null;
  doc_submission_date: string | null;
  outstanding_amount: number;
  claimed_amount: number;
  approved_amount: number;
  claim_creation_date: string;
  claim_status: string;
  is_irdai_breach: boolean;
  tpa_name: string;
  insurance_company_name: string | null;
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function bucketOf(days: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function computeNextRun(s: Schedule, from: Date): Date {
  // Work in IST then convert back to UTC for storage.
  const ist = new Date(from.getTime() + IST_OFFSET_MIN * 60_000);
  const next = new Date(ist);
  next.setUTCSeconds(0, 0);
  next.setUTCHours(s.send_hour, s.send_minute, 0, 0);

  switch (s.cadence) {
    case "daily":
      if (next.getTime() <= ist.getTime()) next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "every_n_days": {
      const n = Math.max(1, s.every_n_days ?? 1);
      while (next.getTime() <= ist.getTime()) next.setUTCDate(next.getUTCDate() + n);
      break;
    }
    case "weekly": {
      const target = s.day_of_week ?? 1; // default Monday
      const diff = (target - next.getUTCDay() + 7) % 7;
      next.setUTCDate(next.getUTCDate() + diff);
      if (next.getTime() <= ist.getTime()) next.setUTCDate(next.getUTCDate() + 7);
      break;
    }
    case "biweekly": {
      const target = s.day_of_week ?? 1;
      const diff = (target - next.getUTCDay() + 7) % 7;
      next.setUTCDate(next.getUTCDate() + diff);
      if (next.getTime() <= ist.getTime()) next.setUTCDate(next.getUTCDate() + 14);
      break;
    }
    case "monthly": {
      const target = Math.min(28, Math.max(1, s.day_of_month ?? 1));
      next.setUTCDate(target);
      if (next.getTime() <= ist.getTime()) {
        next.setUTCMonth(next.getUTCMonth() + 1);
        next.setUTCDate(target);
      }
      break;
    }
    default:
      next.setUTCDate(next.getUTCDate() + 1);
  }
  // Convert IST back to UTC
  return new Date(next.getTime() - IST_OFFSET_MIN * 60_000);
}

function pickClaims(s: Schedule, all: ClaimRow[]): ClaimRow[] {
  // Scope filter
  let scoped = all;
  if (s.scope === "tpa" && s.tpa_name) {
    const t = s.tpa_name.toLowerCase();
    scoped = all.filter(
      (c) =>
        (c.tpa_name ?? "").toLowerCase() === t ||
        (c.insurance_company_name ?? "").toLowerCase() === t,
    );
  }
  if (s.scope === "global" && s.aging_bucket && s.aging_bucket !== "all") {
    scoped = scoped.filter((c) => bucketOf(daysSince(c.claim_creation_date)) === s.aging_bucket);
  }

  // Content toggles — union of selected categories
  const out = new Map<string, ClaimRow>();
  for (const c of scoped) {
    if ((c.outstanding_amount ?? 0) < s.min_outstanding) continue;

    const isDiscrepancy =
      (c.approved_amount ?? 0) > 0 &&
      c.claimed_amount > c.approved_amount; // short paid
    const isDenied = (c.claim_status ?? "").toLowerCase().includes("denied") ||
      (c.claim_status ?? "").toLowerCase().includes("rejected");
    const isPending = (c.outstanding_amount ?? 0) > 0;

    let include = false;
    if (s.include_pending && isPending) include = true;
    if (s.include_irdai_breaches && c.is_irdai_breach) include = true;
    if (s.include_discrepancies && isDiscrepancy) include = true;
    if (s.include_denied && isDenied) include = true;

    if (include) out.set(c.id, c);
  }
  return Array.from(out.values());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Allow `?id=<scheduleId>` to force a manual run for one schedule
  const url = new URL(req.url);
  const forcedId = url.searchParams.get("id");

  const nowIso = new Date().toISOString();
  let q = supabase
    .from("reminder_schedules")
    .select("*")
    .eq("is_active", true)
    .limit(50);
  if (forcedId) q = q.eq("id", forcedId);
  else q = q.or(`next_run_at.is.null,next_run_at.lte.${nowIso}`);

  const { data: schedules, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const due = (schedules ?? []) as Schedule[];
  if (due.length === 0) {
    return new Response(JSON.stringify({ processed: 0, results: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch all open/relevant claims once (pending or discrepancy candidates)
  const { data: claimsData } = await supabase
    .from("claims")
    .select("id,claim_number,patient_name,policy_number,date_of_admission,date_of_discharge,doc_submission_date,outstanding_amount,claimed_amount,approved_amount,claim_creation_date,claim_status,is_irdai_breach,tpa_name,insurance_company_name")
    .order("claim_creation_date", { ascending: true })
    .limit(5000);
  const claims = (claimsData ?? []) as ClaimRow[];

  // Resolve fallback contacts when no recipient override
  const { data: contactsData } = await supabase
    .from("insurer_contacts")
    .select("provider,email,cc_emails,contact_name")
    .eq("is_primary", true);
  const contacts = (contactsData ?? []) as Array<{
    provider: string; email: string; cc_emails: string | null; contact_name: string;
  }>;
  const findContact = (name: string | null) => {
    if (!name) return null;
    const t = name.toLowerCase();
    return contacts.find((c) => c.provider.toLowerCase() === t) ?? null;
  };

  const results: Array<{ id: string; ok: boolean; sent?: number; error?: string }> = [];

  for (const s of due) {
    try {
      const matched = pickClaims(s, claims);
      const tpaForLabel = s.scope === "tpa"
        ? s.tpa_name ?? "Unknown TPA"
        : `Aging ${s.aging_bucket ?? "all"}`;

      // Group by TPA for the actual email (one send per TPA)
      const byTpa = new Map<string, ClaimRow[]>();
      for (const c of matched) {
        const k = c.tpa_name || c.insurance_company_name || "Unknown";
        if (!byTpa.has(k)) byTpa.set(k, []);
        byTpa.get(k)!.push(c);
      }

      let totalSent = 0;
      const errors: string[] = [];

      for (const [tpa, list] of byTpa) {
        const contact = findContact(tpa);
        const recipient = s.recipient_email_override?.trim() || contact?.email || "";
        const cc = (s.cc_emails_override ?? contact?.cc_emails ?? "")
          .split(/[,;\s]+/)
          .map((x) => x.trim())
          .filter(Boolean);

        if (!recipient) {
          // Log skip
          await supabase.from("reminder_runs").insert({
            schedule_id: s.id,
            schedule_name: s.name,
            tpa_name: tpa,
            recipient_email: null,
            cc_emails: cc,
            trigger_kind: forcedId ? "manual" : "auto",
            claim_count: list.length,
            discrepancy_count: list.filter((c) => c.claimed_amount > c.approved_amount && c.approved_amount > 0).length,
            irdai_breach_count: list.filter((c) => c.is_irdai_breach).length,
            total_outstanding: list.reduce((a, b) => a + (b.outstanding_amount ?? 0), 0),
            oldest_claim_days: list.reduce((m, c) => Math.max(m, daysSince(c.claim_creation_date)), 0),
            status: "skipped",
            error_message: "No recipient on file (set TPA Contact or override)",
          });
          continue;
        }

        if (list.length === 0) {
          await supabase.from("reminder_runs").insert({
            schedule_id: s.id,
            schedule_name: s.name,
            tpa_name: tpa,
            recipient_email: recipient,
            cc_emails: cc,
            trigger_kind: forcedId ? "manual" : "auto",
            claim_count: 0,
            status: "skipped",
            error_message: "No matching claims for this rule",
          });
          continue;
        }

        // Build payload for send-outstanding-reminder
        const payload = {
          insurerId: 0,
          insurerName: tpa,
          recipientEmail: recipient,
          ccEmails: cc,
          spocName: contact?.contact_name ?? "Claims Team",
          spocEmail: recipient,
          customSubject: s.subject_template
            ? s.subject_template.replace(/\{\{tpa\}\}/g, tpa)
            : undefined,
          customBody: s.body_template ?? undefined,
          claims: list.map((c) => ({
            claim_number: c.claim_number,
            patient_name: c.patient_name,
            policy_number: c.policy_number,
            date_of_admission: c.date_of_admission,
            date_of_discharge: c.date_of_discharge,
            doc_submission_date: c.doc_submission_date,
            outstanding_amount: c.outstanding_amount,
            days_since_claim: daysSince(c.claim_creation_date),
            claim_status: c.claim_status,
            is_irdai_breach: c.is_irdai_breach,
          })),
        };

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-outstanding-reminder`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        const ok = resp.ok && (data?.success ?? true);

        await supabase.from("reminder_runs").insert({
          schedule_id: s.id,
          schedule_name: s.name,
          tpa_name: tpa,
          recipient_email: recipient,
          cc_emails: cc,
          trigger_kind: forcedId ? "manual" : "auto",
          claim_count: list.length,
          discrepancy_count: list.filter((c) => c.claimed_amount > c.approved_amount && c.approved_amount > 0).length,
          irdai_breach_count: list.filter((c) => c.is_irdai_breach).length,
          total_outstanding: list.reduce((a, b) => a + (b.outstanding_amount ?? 0), 0),
          oldest_claim_days: list.reduce((m, c) => Math.max(m, daysSince(c.claim_creation_date)), 0),
          status: ok ? "sent" : "failed",
          error_message: ok ? null : (data?.error ?? `HTTP ${resp.status}`),
          sent_at: ok ? new Date().toISOString() : null,
        });

        if (ok) totalSent += 1;
        else errors.push(`${tpa}: ${data?.error ?? resp.status}`);
      }

      // Reschedule
      const next = computeNextRun(s, new Date());
      await supabase
        .from("reminder_schedules")
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: next.toISOString(),
        })
        .eq("id", s.id);

      results.push({
        id: s.id,
        ok: errors.length === 0,
        sent: totalSent,
        error: errors.length ? errors.join(" | ") : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      await supabase.from("reminder_runs").insert({
        schedule_id: s.id,
        schedule_name: s.name,
        tpa_name: s.tpa_name,
        trigger_kind: forcedId ? "manual" : "auto",
        status: "failed",
        error_message: msg,
      });
      results.push({ id: s.id, ok: false, error: msg });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
