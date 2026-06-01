// Sends a single AI-drafted email (appeal letter, query reply, insurer email, etc.)
// to a TPA / Insurer contact, with optional PDF/image attachments from the
// ai-attachments storage bucket. Logs the send to discrepancy_action_log so the
// drafted output appears on the claim's communication timeline.
//
// Sender resolution:
//   - If `actingUserId` is provided AND that user has verified SMTP creds,
//     send via their personal mailbox (real recipient gets the mail).
//   - Otherwise fall back to platform Resend in sandbox mode (rerouted to
//     a single test recipient).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveSender, sendWithSender, type AppUserRow } from "../_shared/smtpSender.ts";
import { requireUser, assertCallerCanActAs } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SANDBOX_RECIPIENT = "rcmbuddy.in@gmail.com";

interface RequestBody {
  claimId?: string | null;
  claimNumber?: string | null;
  patientName?: string | null;
  insurerName?: string | null;
  hospitalName?: string | null;
  recipientEmail: string;
  ccEmails?: string[];
  subject: string;
  body: string;            // plain-text AI draft (will be wrapped in HTML)
  tool?: string;           // e.g. appeal_letter, query_reply
  generationId?: string | null;
  attachmentPaths?: string[]; // storage paths in ai-attachments bucket
  actingUserId?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildHtml(body: RequestBody): string {
  const hospital = body.hospitalName ?? "Hospital Insurance Desk";
  const tag = (body.tool ?? "AI Draft").replace(/_/g, " ").toUpperCase();
  const safeBody = escapeHtml(body.body).replace(/\n/g, "<br/>");
  const meta: string[] = [];
  if (body.claimNumber) meta.push(`<strong>Claim:</strong> ${escapeHtml(body.claimNumber)}`);
  if (body.patientName) meta.push(`<strong>Patient:</strong> ${escapeHtml(body.patientName)}`);
  if (body.insurerName) meta.push(`<strong>Insurer / TPA:</strong> ${escapeHtml(body.insurerName)}`);

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:22px 30px;color:#ffffff;">
          <div style="font-size:11px;letter-spacing:2px;opacity:0.85;text-transform:uppercase;">${escapeHtml(tag)}</div>
          <div style="font-size:20px;font-weight:700;margin-top:6px;">${escapeHtml(hospital)}</div>
          ${meta.length ? `<div style="font-size:12px;margin-top:6px;opacity:0.85;line-height:1.6;">${meta.join(" &nbsp;·&nbsp; ")}</div>` : ""}
        </td></tr>
        <tr><td style="padding:26px 30px 8px;">
          <div style="white-space:pre-wrap;font-size:14px;line-height:1.65;color:#0f172a;">${safeBody}</div>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:14px 30px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e5e7eb;">
          Drafted with AI assistance · Reviewed and sent by ${escapeHtml(hospital)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);


  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.recipientEmail || !body.subject || !body.body) {
    return new Response(
      JSON.stringify({ error: "recipientEmail, subject and body are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Resolve sender (per-user SMTP if available, else platform Resend)
  let actingUser: AppUserRow | null = null;
  if (body.actingUserId) {
    const aclErr = await assertCallerCanActAs(supabase, authed, body.actingUserId);
    if (aclErr) return aclErr;
    const { data } = await supabase
      .from("app_users")
      .select("id,name,email,smtp_host,smtp_port,smtp_username,smtp_password,smtp_use_tls,smtp_from_name,smtp_from_email,smtp_reply_to,smtp_verified_at")
      .eq("id", body.actingUserId)
      .maybeSingle();
    actingUser = (data as AppUserRow | null) ?? null;
  }
  const sender = resolveSender(actingUser);


  if (sender.mode === "resend" && (!LOVABLE_API_KEY || !RESEND_API_KEY)) {
    return new Response(
      JSON.stringify({ error: "Email service not configured." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // Download + base64 attachments (PDF/images from AI dialog)
    const attachments: Array<{ filename: string; content: string }> = [];
    for (const path of body.attachmentPaths ?? []) {
      try {
        const { data, error } = await supabase.storage.from("ai-attachments").download(path);
        if (error || !data) continue;
        const buf = new Uint8Array(await data.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        const b64 = btoa(bin);
        const filename = path.split("/").pop() ?? `attachment-${attachments.length + 1}`;
        attachments.push({ filename, content: b64 });
      } catch (e) {
        console.error("attach failed", path, e);
      }
    }

    const useSandbox = sender.mode === "resend";
    const subject = useSandbox ? `[TEST → ${body.recipientEmail}] ${body.subject}` : body.subject;
    const to = useSandbox ? [SANDBOX_RECIPIENT] : [body.recipientEmail];
    const cc = useSandbox ? undefined : body.ccEmails?.filter(Boolean);

    const result = await sendWithSender(
      sender,
      { to, cc, subject, html: buildHtml(body), attachments: attachments.length ? attachments : undefined },
      RESEND_API_KEY,
      LOVABLE_API_KEY,
    );

    if (!result.ok) {
      return new Response(
        JSON.stringify({ success: false, error: result.error, via: result.via }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Communication-log entry on the claim (if linked)
    if (body.claimId) {
      const ccList = (body.ccEmails ?? []).map((s) => s.trim()).filter(Boolean);
      const attachmentRecords = (body.attachmentPaths ?? []).map((p) => ({
        name: p.split("/").pop() ?? p,
        path: p,
      }));
      await supabase.from("discrepancy_action_log").insert({
        claim_id: body.claimId,
        action_type: "ai_email_sent",
        channel: "email",
        recipient: body.recipientEmail,
        tone: body.tool ?? "ai_draft",
        subject: body.subject,
        body_preview: body.body.slice(0, 500),
        cc_emails: ccList,
        attachments: attachmentRecords,
        ai_generation_id: body.generationId ?? null,
        performed_by: actingUser?.email ?? null,
      });
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId ?? null, via: result.via, attachments: attachments.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
