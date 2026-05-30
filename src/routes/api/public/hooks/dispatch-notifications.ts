/**
 * POST /api/public/hooks/dispatch-notifications
 *
 * Scheduled dispatcher invoked by pg_cron every 30 minutes. For each
 * organization, finds:
 *   (a) claims with is_irdai_breach = true where the user hasn't been
 *       notified in the last 24h, and
 *   (b) follow-ups whose next_action_date is today and have no later
 *       follow-up logged (i.e., still pending),
 * then inserts one outstanding_notifications row per (claim, user) for every
 * member of the org whose preference for the relevant type is enabled.
 *
 * Deduped via dedupe_key (unique per user_id, dedupe_key).
 *
 * Auth: validated via the Supabase anon key in the `apikey` header (standard
 * pg_cron + /api/public/* pattern). Uses the service-role client server-side
 * to bypass RLS for inserts.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface DispatchResult {
  ok: true;
  orgs: number;
  inserted: number;
  sla_candidates: number;
  followup_candidates: number;
  contract_expiry_candidates: number;
}

/** Days from "today" before a contract expires that should trigger an alert. */
const CONTRACT_EXPIRY_WARN_DAYS = 60;

function todayYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

function ymdOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

async function runDispatcher(): Promise<DispatchResult> {
  const result: DispatchResult = {
    ok: true,
    orgs: 0,
    inserted: 0,
    sla_candidates: 0,
    followup_candidates: 0,
    contract_expiry_candidates: 0,
  };

  // Pull all (user_id, org_id) memberships and prefs in two queries.
  const { data: members, error: mErr } = await supabaseAdmin
    .from("organization_members")
    .select("user_id, org_id");
  if (mErr) throw mErr;

  const { data: prefs, error: pErr } = await supabaseAdmin
    .from("user_notification_prefs")
    .select("user_id, pref_key, enabled");
  if (pErr) throw pErr;

  // user_id -> set of enabled pref_keys
  const enabledByUser = new Map<string, Set<string>>();
  for (const r of prefs ?? []) {
    if (!r.enabled) continue;
    let s = enabledByUser.get(r.user_id as string);
    if (!s) {
      s = new Set();
      enabledByUser.set(r.user_id as string, s);
    }
    s.add(r.pref_key as string);
  }
  // Default to enabled for sla_breach + follow_up_due when no row exists,
  // matching the in-app defaults.
  const isEnabled = (uid: string, key: string): boolean => {
    const s = enabledByUser.get(uid);
    if (s) return s.has(key);
    return key === "sla_breach" || key === "follow_up_due";
  };

  // Group members by org
  const orgMembers = new Map<string, string[]>();
  for (const m of members ?? []) {
    const arr = orgMembers.get(m.org_id as string) ?? [];
    arr.push(m.user_id as string);
    orgMembers.set(m.org_id as string, arr);
  }

  const inserts: Array<{
    org_id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    ref_claim_id: string | null;
    dedupe_key: string;
  }> = [];

  const dayBucket = todayYmd();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  for (const [orgId, userIds] of orgMembers.entries()) {
    result.orgs += 1;

    // (a) SLA / IRDAI breaches with no notification of this type in last 24h.
    // We rely on the unique dedupe_key (user_id, "sla:<claim>:<YYYY-MM-DD>")
    // so the same breach can re-alert once per day, never more.
    const { data: breaches } = await supabaseAdmin
      .from("claims")
      .select("id, claim_number, patient_name, outstanding_amount, updated_at")
      .eq("org_id", orgId)
      .eq("is_irdai_breach", true)
      .gte("updated_at", since24h)
      .limit(500);
    result.sla_candidates += breaches?.length ?? 0;

    for (const c of breaches ?? []) {
      for (const uid of userIds) {
        if (!isEnabled(uid, "sla_breach")) continue;
        inserts.push({
          org_id: orgId,
          user_id: uid,
          type: "sla_breach",
          title: `SLA Breach: Claim ${c.claim_number ?? c.id}`,
          message: `${c.patient_name ?? "Claim"} has exceeded the 30-day TAT (₹${
            Number(c.outstanding_amount ?? 0).toLocaleString("en-IN")
          } outstanding).`,
          ref_claim_id: c.id as string,
          dedupe_key: `sla:${c.id}:${dayBucket}`,
        });
      }
    }

    // (b) Follow-ups due today that are still pending.
    // The follow_ups table has no status column; "pending" = no later follow-up
    // for the same claim. We approximate by selecting today's rows and
    // letting the dedupe_key prevent re-notifying on subsequent cron ticks.
    const { data: fus } = await supabaseAdmin
      .from("follow_ups")
      .select("id, claim_id, next_action_date, notes")
      .eq("org_id", orgId)
      .eq("next_action_date", dayBucket)
      .limit(500);
    result.followup_candidates += fus?.length ?? 0;

    const claimIds = Array.from(new Set((fus ?? []).map((f) => f.claim_id as string)));
    const claimsById = new Map<string, { claim_number: string | null; patient_name: string | null }>();
    if (claimIds.length > 0) {
      const { data: cs } = await supabaseAdmin
        .from("claims")
        .select("id, claim_number, patient_name")
        .in("id", claimIds);
      for (const c of cs ?? []) {
        claimsById.set(c.id as string, {
          claim_number: (c.claim_number as string | null) ?? null,
          patient_name: (c.patient_name as string | null) ?? null,
        });
      }
    }

    for (const f of fus ?? []) {
      const c = claimsById.get(f.claim_id as string);
      for (const uid of userIds) {
        if (!isEnabled(uid, "follow_up_due")) continue;
        inserts.push({
          org_id: orgId,
          user_id: uid,
          type: "follow_up_due",
          title: `Follow-up due: Claim ${c?.claim_number ?? f.claim_id}`,
          message: `${c?.patient_name ?? "Claim"} has a follow-up scheduled for today.`,
          ref_claim_id: f.claim_id as string,
          dedupe_key: `fu:${f.id}:${dayBucket}`,
        });
      }
    }

    // (c) Contract expiry warnings — insurer_contacts.contract_expiry_date
    // falls within the next CONTRACT_EXPIRY_WARN_DAYS days (inclusive of today).
    // Dedupe per (user, contact, day-bucket) so we re-nag at most once per day
    // until the user clears the expiry date or it passes.
    const expiryFrom = dayBucket;
    const expiryTo = ymdOffset(CONTRACT_EXPIRY_WARN_DAYS);
    const { data: expiring } = await supabaseAdmin
      .from("insurer_contacts")
      .select("id, provider, contract_expiry_date")
      .eq("org_id", orgId)
      .not("contract_expiry_date", "is", null)
      .gte("contract_expiry_date", expiryFrom)
      .lte("contract_expiry_date", expiryTo)
      .limit(500);
    result.contract_expiry_candidates += expiring?.length ?? 0;

    for (const ct of expiring ?? []) {
      for (const uid of userIds) {
        if (!isEnabled(uid, "contract_expiry")) continue;
        inserts.push({
          org_id: orgId,
          user_id: uid,
          type: "contract_expiry",
          title: `Contract expiring: ${ct.provider ?? "Provider"}`,
          message: `Contract with ${ct.provider ?? "this provider"} expires on ${ct.contract_expiry_date}`,
          ref_claim_id: null,
          dedupe_key: `contract:${ct.id}:${dayBucket}`,
        });
      }
    }
  }

  // Batch insert; dedupe_key uniqueness silently rejects duplicates.
  if (inserts.length > 0) {
    // Chunk to keep the request small.
    const CHUNK = 500;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const chunk = inserts.slice(i, i + CHUNK);
      const { error } = await supabaseAdmin
        .from("outstanding_notifications")
        .upsert(chunk, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
      if (error) {
        console.error("[dispatch-notifications] insert error", error);
      } else {
        result.inserted += chunk.length;
      }
    }
  }

  return result;
}

export const Route = createFileRoute("/api/public/hooks/dispatch-notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") ?? request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await runDispatcher();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error("[dispatch-notifications] failed", e);
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
