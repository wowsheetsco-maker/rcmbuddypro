// Sends internal team status digests (daily / weekly / monthly).
// Computes per-user content based on role + cadence and sends via the user's
// SMTP creds (or falls back to platform Resend) using the shared sendWithSender.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  resolveSender, sendWithSender, type AppUserRow,
} from "../_shared/smtpSender.ts";
import { requireUserOrCron } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Cadence = "daily" | "weekly" | "monthly";

function fmtInr(n: number): string {
  if (!n) return "0";
  return new Intl.NumberFormat("en-IN").format(Math.round(n));
}
function periodLabel(c: Cadence): string {
  if (c === "daily") return "Today";
  if (c === "weekly") return "Last 7 days";
  return "Last 30 days";
}
function periodStartIso(c: Cadence): string {
  const d = new Date();
  if (c === "daily") d.setDate(d.getDate() - 1);
  else if (c === "weekly") d.setDate(d.getDate() - 7);
  else d.setDate(d.getDate() - 30);
  return d.toISOString();
}
function renderTpl(tpl: string, tokens: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) =>
    tokens[k] !== undefined && tokens[k] !== null ? String(tokens[k]) : `{${k}}`);
}
function plainToHtml(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.55;color:#111;white-space:pre-wrap">${esc}</div>`;
}

interface DigestTpl { subject: string; body: string; format: "html" | "text" }
const DEFAULT_TPL: Record<Cadence, DigestTpl> = {
  daily:   { subject: "Your tasks for today — {hospital}", format: "html",
             body: "Hi {user_name},\n\nWorklist for today as {user_role}.\n• Open follow-ups: {my_open_tasks}\n• Overdue: {my_overdue}\n• IRDAI breaches: {breaches}\n\nTeam pulse:\n{kpi_block}\n\nTasks:\n{tasks_list}\n\n— RCM Buddy" },
  weekly:  { subject: "Weekly performance — {hospital} ({period})", format: "html",
             body: "Hi {user_name},\n\nWeekly recap for {period}.\n\n{kpi_block}\n\n— RCM Buddy" },
  monthly: { subject: "Monthly scorecard — {hospital} ({period})", format: "html",
             body: "Hi {user_name},\n\nMonthly scorecard for {period}.\n\n{kpi_block}\n\n— RCM Buddy" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const gate = await requireUserOrCron(req);
  if (gate instanceof Response) return gate;



  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: { cadence?: Cadence; trigger?: string; orgId?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const cadence: Cadence = (body.cadence ?? "daily") as Cadence;

  // Process each org that has at least one subscription for this cadence
  const { data: subRows } = await supabase
    .from("team_digest_subscriptions")
    .select("org_id, app_user_id, daily, weekly, monthly")
    .eq(cadence, true);

  const byOrg = new Map<string, string[]>();
  (subRows ?? []).forEach((r) => {
    const arr = byOrg.get(r.org_id) ?? [];
    arr.push(r.app_user_id);
    byOrg.set(r.org_id, arr);
  });

  if (body.orgId && !byOrg.has(body.orgId)) byOrg.set(body.orgId, []);

  const outResults: Array<{ orgId: string; sent: number; failed: number }> = [];

  for (const [orgId, userIds] of byOrg.entries()) {
    // Templates
    const { data: tplRow } = await supabase
      .from("app_settings").select("value")
      .eq("org_id", orgId).eq("key", "team_digest_templates").maybeSingle();
    const tpls = { ...DEFAULT_TPL, ...(tplRow?.value as Record<Cadence, DigestTpl> ?? {}) };
    const tpl = tpls[cadence] ?? DEFAULT_TPL[cadence];

    // Org / hospital
    const { data: org } = await supabase
      .from("organizations").select("name").eq("id", orgId).maybeSingle();
    const hospital = org?.name ?? "Your Hospital";

    // Org-wide stats
    const periodStart = periodStartIso(cadence);
    const { data: claims } = await supabase
      .from("claims")
      .select("id, outstanding_amount, is_irdai_breach, claim_status, settled_amount, payment_update_date")
      .eq("org_id", orgId);
    const teamOutstanding = (claims ?? []).reduce((s, c) => s + Number(c.outstanding_amount ?? 0), 0);
    const teamClaims = (claims ?? []).filter((c) => Number(c.outstanding_amount ?? 0) > 0).length;
    const breaches = (claims ?? []).filter((c) => c.is_irdai_breach).length;
    const settledPeriod = (claims ?? []).filter((c) =>
      c.payment_update_date && new Date(c.payment_update_date).toISOString() >= periodStart,
    ).length;
    const collectedPeriod = (claims ?? []).filter((c) =>
      c.payment_update_date && new Date(c.payment_update_date).toISOString() >= periodStart,
    ).reduce((s, c) => s + Number(c.settled_amount ?? 0), 0);

    const kpiBlock =
      `📊 Open claims: ${teamClaims} · Outstanding: ₹${fmtInr(teamOutstanding)}\n` +
      `⚠️ IRDAI breaches: ${breaches}\n` +
      `✅ Settled (${periodLabel(cadence).toLowerCase()}): ${settledPeriod} · Collected: ₹${fmtInr(collectedPeriod)}`;

    // If no explicit users, pick all active app_users
    let recipients: AppUserRow[] = [];
    if (userIds.length > 0) {
      const { data } = await supabase.from("app_users").select("*").in("id", userIds);
      recipients = (data ?? []) as AppUserRow[];
    }

    let sent = 0, failed = 0;
    for (const u of recipients) {
      // Per-user follow-up tasks
      const { data: tasks } = await supabase
        .from("follow_ups")
        .select("next_action_date, outcome, ref_number, notes, claim_id")
        .eq("org_id", orgId)
        .eq("logged_by", u.email)
        .order("next_action_date", { ascending: true })
        .limit(15);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const myOpen = (tasks ?? []).length;
      const myOverdue = (tasks ?? []).filter((t) =>
        t.next_action_date && new Date(t.next_action_date) < today).length;
      const tasksList = (tasks ?? []).slice(0, 10).map((t, i) =>
        `${i + 1}. [${t.next_action_date ?? "—"}] ${t.outcome ?? "Follow up"}${t.ref_number ? ` · Ref ${t.ref_number}` : ""}`,
      ).join("\n") || "No open follow-ups assigned to you.";

      const tokens = {
        user_name: u.name, user_role: u.role ?? "Team",
        hospital, period: periodLabel(cadence),
        my_open_tasks: myOpen, my_overdue: myOverdue,
        team_outstanding: fmtInr(teamOutstanding), team_claims: teamClaims,
        breaches, settled_period: settledPeriod,
        collected_period: fmtInr(collectedPeriod),
        tasks_list: tasksList, kpi_block: kpiBlock,
      };

      const subject = renderTpl(tpl.subject, tokens);
      const renderedBody = renderTpl(tpl.body, tokens);
      const html = tpl.format === "html" ? plainToHtml(renderedBody) : `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${renderedBody.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
      const text = renderedBody;

      const sender = resolveSender(u);
      const result = await sendWithSender(sender, {
        to: [u.email], subject, html, text,
      }, RESEND_KEY, LOVABLE_KEY);
      if (result.ok) sent++; else { failed++; console.error("digest fail", u.email, result.error); }
    }

    await supabase.from("team_digest_runs").insert({
      org_id: orgId, cadence,
      recipients_count: recipients.length, sent_count: sent, failed_count: failed,
      trigger_kind: body.trigger ?? "cron",
    });
    outResults.push({ orgId, sent, failed });
  }

  const totalSent = outResults.reduce((s, r) => s + r.sent, 0);
  return new Response(JSON.stringify({ success: true, sent: totalSent, results: outResults }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
