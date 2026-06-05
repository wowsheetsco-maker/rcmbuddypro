/**
 * Shared server-side helper for "submission reminder" notifications.
 *
 * Sends in-app notifications (always), plus best-effort email (Resend via the
 * Lovable connector gateway) and WhatsApp (Meta Cloud API) when those channels
 * are configured AND the recipient has an address/phone on file.
 *
 * Used by:
 *  - the scheduled dispatcher (`/api/public/hooks/dispatch-notifications`)
 *  - the manual `resendSubmissionReminder` server function
 *
 * Server-only: imports the admin client which uses the service role key.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ReminderTrigger = "scheduled" | "manual";

export interface RecipientChannelResult {
  app_user_id: string;
  name: string;
  in_app: boolean;
  email?: { ok: boolean; to?: string; error?: string };
  whatsapp?: { ok: boolean; to?: string; message_id?: string; error?: string };
}

export interface SubmissionReminderResult {
  submission_id: string;
  claim_id: string;
  due_date: string | null;
  overdue: boolean;
  recipients: RecipientChannelResult[];
  channels_used: { in_app: number; email: number; whatsapp: number };
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function normalizeWaNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) {
    const d = cleaned.slice(1);
    return d.length >= 10 && d.length <= 15 ? d : null;
  }
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) return `91${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("0")) return `91${cleaned.slice(1)}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return cleaned;
  if (cleaned.length >= 11 && cleaned.length <= 15) return cleaned;
  return null;
}

interface PrefRow { user_id: string; pref_key: string; enabled: boolean }
interface AppUserLite {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  auth_user_id: string | null;
}

async function sendEmail(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!resendKey || !lovableKey) return { ok: false, error: "email_not_configured" };
  try {
    const resp = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": resendKey,
      },
      body: JSON.stringify({
        from: "RCM Buddy <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return { ok: false, error: `Resend ${resp.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendWhatsAppText(to: string, body: string): Promise<{ ok: boolean; message_id?: string; error?: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, error: "whatsapp_not_configured" };
  try {
    const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body, preview_url: false },
      }),
    });
    const json = (await resp.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!resp.ok) return { ok: false, error: json.error?.message ?? `HTTP ${resp.status}` };
    return { ok: true, message_id: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Send a reminder for a single submission. Always inserts in-app notifications
 * (deduped per recipient per day). Optionally sends email + WhatsApp when
 * configured. Manual triggers always notify regardless of dedupe key — they
 * use a unique timestamp suffix and skip the per-user enabled-prefs gate.
 */
export async function sendSubmissionReminder(
  submissionId: string,
  opts: { trigger: ReminderTrigger; actorAppUserId?: string | null } = { trigger: "scheduled" },
): Promise<SubmissionReminderResult | null> {
  const { data: s } = await supabaseAdmin
    .from("claim_submissions")
    .select("id, org_id, claim_id, assignee_id, branch_id, status, due_date")
    .eq("id", submissionId)
    .maybeSingle();
  if (!s) return null;

  const { data: claim } = await supabaseAdmin
    .from("claims")
    .select("claim_number, patient_name")
    .eq("id", s.claim_id)
    .maybeSingle();

  let officerId: string | null = null;
  if (s.branch_id) {
    const { data: b } = await supabaseAdmin
      .from("hospital_branches")
      .select("submission_officer_id")
      .eq("id", s.branch_id)
      .maybeSingle();
    officerId = (b?.submission_officer_id as string | null) ?? null;
  }

  const recipientIds = Array.from(new Set([s.assignee_id, officerId].filter(Boolean) as string[]));
  if (recipientIds.length === 0) {
    return {
      submission_id: s.id,
      claim_id: s.claim_id,
      due_date: s.due_date ?? null,
      overdue: false,
      recipients: [],
      channels_used: { in_app: 0, email: 0, whatsapp: 0 },
    };
  }

  const { data: users } = await supabaseAdmin
    .from("app_users")
    .select("id, name, email, phone, auth_user_id")
    .in("id", recipientIds);
  const userById = new Map<string, AppUserLite>(
    (users ?? []).map((u) => [u.id as string, u as unknown as AppUserLite]),
  );

  const authUserIds = (users ?? [])
    .map((u) => u.auth_user_id as string | null)
    .filter(Boolean) as string[];

  let prefs: PrefRow[] = [];
  if (authUserIds.length > 0 && opts.trigger === "scheduled") {
    const { data } = await supabaseAdmin
      .from("user_notification_prefs")
      .select("user_id, pref_key, enabled")
      .in("user_id", authUserIds);
    prefs = (data ?? []) as PrefRow[];
  }
  const enabledByUser = new Map<string, Set<string>>();
  for (const p of prefs) {
    if (!p.enabled) continue;
    let set = enabledByUser.get(p.user_id);
    if (!set) { set = new Set(); enabledByUser.set(p.user_id, set); }
    set.add(p.pref_key);
  }
  const isEnabled = (authUid: string, key: string) => {
    if (opts.trigger === "manual") return true;
    const s2 = enabledByUser.get(authUid);
    if (s2) return s2.has(key) || s2.has("submission_due");
    return true; // default-on
  };

  const day = todayYmd();
  const due = s.due_date as string | null;
  const overdue = !!due && due < day;
  const prefKey = overdue ? "submission_overdue" : "submission_due";
  const claimLabel = claim?.claim_number ?? s.claim_id;
  const patient = claim?.patient_name ?? "the patient";
  const title = overdue
    ? `Submission overdue: ${claimLabel}`
    : `Submission due${due ? ` ${due}` : ""}: ${claimLabel}`;
  const message = `${patient} — ${
    s.status === "submitted" ? "acknowledgement pending" : "documents not yet submitted"
  }${due ? ` (due ${due})` : ""}.`;
  const emailSubject = `[Action Required] ${title}`;
  const emailBody =
    `${message}\n\n` +
    `Claim: ${claimLabel}\n` +
    `Status: ${s.status}\n` +
    (due ? `Due date: ${due}\n` : "") +
    `\nPlease submit the documents (or upload the acknowledgement) in the Submission Tracker.\n`;
  const waBody = `*${title}*\n${message}\n\nOpen RCM Buddy → Claims → Submission to action.`;

  const channels_used = { in_app: 0, email: 0, whatsapp: 0 };
  const recipients: RecipientChannelResult[] = [];
  const inAppRows: Array<{
    org_id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    ref_claim_id: string | null;
    dedupe_key: string;
  }> = [];

  for (const appId of recipientIds) {
    const u = userById.get(appId);
    if (!u) continue;
    const auth = u.auth_user_id;
    const dedupeSuffix = opts.trigger === "manual" ? `manual:${Date.now()}` : day;
    const result: RecipientChannelResult = { app_user_id: u.id, name: u.name, in_app: false };

    if (auth && isEnabled(auth, prefKey)) {
      inAppRows.push({
        org_id: s.org_id as string,
        user_id: auth,
        type: overdue ? "submission_overdue" : "submission_due",
        title,
        message,
        ref_claim_id: s.claim_id as string,
        dedupe_key: `${overdue ? "submission_overdue" : "submission_due"}:${s.id}:${dedupeSuffix}`,
      });
      result.in_app = true;
      channels_used.in_app += 1;
    }

    if (u.email) {
      const r = await sendEmail(u.email, emailSubject, emailBody);
      result.email = { ok: r.ok, to: u.email, error: r.error };
      if (r.ok) channels_used.email += 1;
    }

    const wa = normalizeWaNumber(u.phone);
    if (wa) {
      const r = await sendWhatsAppText(wa, waBody);
      result.whatsapp = { ok: r.ok, to: wa, message_id: r.message_id, error: r.error };
      if (r.ok) channels_used.whatsapp += 1;
    }

    recipients.push(result);
  }

  if (inAppRows.length > 0) {
    await supabaseAdmin
      .from("outstanding_notifications")
      .upsert(inAppRows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  }

  await supabaseAdmin.from("claim_submission_events").insert({
    org_id: s.org_id as string,
    submission_id: s.id as string,
    claim_id: s.claim_id as string,
    actor_id: opts.actorAppUserId ?? null,
    event_type: "reminder_sent",
    payload: {
      trigger: opts.trigger,
      due_date: due,
      overdue,
      recipients: recipients.map((r) => ({
        app_user_id: r.app_user_id,
        name: r.name,
        in_app: r.in_app,
        email: r.email ? { ok: r.email.ok, to: r.email.to, error: r.email.error } : null,
        whatsapp: r.whatsapp ? { ok: r.whatsapp.ok, to: r.whatsapp.to, error: r.whatsapp.error } : null,
      })),
      channels_used,
    },
  });

  return {
    submission_id: s.id as string,
    claim_id: s.claim_id as string,
    due_date: due,
    overdue,
    recipients,
    channels_used,
  };
}
