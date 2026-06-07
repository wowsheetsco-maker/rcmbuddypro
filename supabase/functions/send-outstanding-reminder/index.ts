// Sends a beautifully formatted "Outstanding Claims Reminder" email
// to a TPA / Insurer with an Excel attachment listing pending claims.
// Triggered directly from the UI ("send now") or by the cron dispatcher
// for scheduled reminders.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { resolveSender, sendWithSender, type AppUserRow } from "../_shared/smtpSender.ts";
import { requireUserOrCron, assertCallerCanActAs } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SANDBOX_RECIPIENT = "rcmbuddy.in@gmail.com";

interface ClaimRow {
  claim_number: string;
  patient_name: string;
  policy_number: string | null;
  date_of_admission: string | null;
  date_of_discharge: string | null;
  doc_submission_date: string | null;
  outstanding_amount: number;
  days_since_claim: number;
  claim_status: string;
  is_irdai_breach: boolean;
}

interface RequestBody {
  reminderId?: string; // when invoked from cron
  insurerId: number;
  insurerName: string;
  recipientEmail: string;
  ccEmails?: string[];
  hospitalName?: string;
  spocName?: string;
  spocEmail?: string;
  paymentTatDays?: number;
  claims: ClaimRow[];
  // Optional overrides from the Follow-up Engine composer:
  customSubject?: string;
  customBody?: string; // plain text or raw HTML, depending on bodyFormat
  bodyFormat?: "html" | "text";
  tone?: "formal" | "urgent" | "irdai" | "friendly";
  actingUserId?: string | null;
}

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function buildExcel(insurerName: string, claims: ClaimRow[]): string {
  const rows = claims.map((c, i) => ({
    "S.No": i + 1,
    "Claim Number": c.claim_number,
    "Patient Name": c.patient_name,
    "Policy Number": c.policy_number ?? "—",
    "Admission Date": c.date_of_admission ?? "—",
    "Discharge Date": c.date_of_discharge ?? "—",
    "Doc Submission Date": c.doc_submission_date ?? "—",
    "Outstanding (INR)": c.outstanding_amount,
    "Age (Days)": c.days_since_claim,
    "Status": c.claim_status,
    "IRDAI Breach": c.is_irdai_breach ? "YES" : "No",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 6 }, { wch: 16 }, { wch: 26 }, { wch: 22 },
    { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
    { wch: 12 }, { wch: 16 }, { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Outstanding Claims");

  // Add a summary sheet
  const total = claims.reduce((s, c) => s + c.outstanding_amount, 0);
  const oldest = claims.reduce(
    (m, c) => Math.max(m, c.days_since_claim),
    0,
  );
  const breaches = claims.filter((c) => c.is_irdai_breach).length;
  const summary = [
    ["Insurer / TPA", insurerName],
    ["Report Generated", new Date().toLocaleString("en-IN")],
    ["Total Outstanding Claims", claims.length],
    ["Total Outstanding Amount (INR)", total],
    ["Oldest Claim Age (Days)", oldest],
    ["IRDAI Breaches (>15d)", breaches],
  ];
  const sws = XLSX.utils.aoa_to_sheet(summary);
  sws["!cols"] = [{ wch: 32 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, sws, "Summary");

  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

function buildEmailHtml(body: RequestBody) {
  const total = body.claims.reduce((s, c) => s + c.outstanding_amount, 0);
  const oldest = body.claims.reduce(
    (m, c) => Math.max(m, c.days_since_claim),
    0,
  );
  const breaches = body.claims.filter((c) => c.is_irdai_breach).length;
  const showDetail = body.claims.length <= 3;

  const detailClaims = showDetail
    ? [...body.claims].sort((a, b) => b.days_since_claim - a.days_since_claim)
    : [];

  const detailRows = detailClaims
    .map(
      (c) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:13px;">${c.claim_number}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;">${c.patient_name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#b91c1c;font-size:13px;">${inr(c.outstanding_amount)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:center;font-size:13px;">
          <span style="background:${c.days_since_claim > 15 ? "#fee2e2" : "#fef3c7"};color:${c.days_since_claim > 15 ? "#991b1b" : "#92400e"};padding:3px 8px;border-radius:4px;font-weight:600;">${c.days_since_claim}d</span>
        </td>
      </tr>`,
    )
    .join("");

  const hospital = body.hospitalName ?? "Our Hospital";

  const detailSection = showDetail
    ? `<!-- Claim Details -->
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#475569;margin:0 0 10px;">Claim Details</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">Claim #</th>
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">Patient</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">Amount</th>
                <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">Age</th>
              </tr>
            </thead>
            <tbody>${detailRows}</tbody>
          </table>`
    : `<!-- Summary -->
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px 18px;margin:0 0 24px;">
            <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#075985;margin-bottom:10px;">Pending Claims Summary</div>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#0f172a;">
              There are <strong>${body.claims.length} pending claims</strong> with a total outstanding amount of <strong>${inr(total)}</strong>.
              The longest pending claim is <strong>${oldest} days</strong> old.
              A complete claim-wise breakdown is attached as an Excel file for your reference.
            </p>
          </div>`;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:28px 32px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:2px;opacity:0.85;text-transform:uppercase;">Outstanding Claims Reminder</div>
          <div style="font-size:22px;font-weight:700;margin-top:6px;">${hospital}</div>
          <div style="font-size:13px;margin-top:4px;opacity:0.9;">Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Dear <strong>${body.insurerName} Team</strong>,</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
            Hope you're having a smooth week.
          </p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
            We wanted to gently follow up on a few claim settlements from our end. We currently have <strong>${body.claims.length} claims outstanding</strong> with a total amount of <strong>${inr(total)}</strong>. We understand you manage a high volume of cases, but some of these have been pending for a while, with the oldest dating back <strong>${oldest} days</strong>${breaches > 0 ? `, and <strong>${breaches} claim${breaches === 1 ? "" : "s"}</strong> exceeding the IRDAI 15-day processing guideline` : ""}.
          </p>

          <!-- KPI Cards -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
            <tr>
              <td width="33%" style="padding:4px;">
                <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;text-align:center;">
                  <div style="font-size:11px;text-transform:uppercase;color:#991b1b;letter-spacing:0.5px;font-weight:600;">Outstanding</div>
                  <div style="font-size:20px;font-weight:700;color:#991b1b;margin-top:6px;">${inr(total)}</div>
                </div>
              </td>
              <td width="33%" style="padding:4px;">
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;text-align:center;">
                  <div style="font-size:11px;text-transform:uppercase;color:#92400e;letter-spacing:0.5px;font-weight:600;">Pending Claims</div>
                  <div style="font-size:20px;font-weight:700;color:#92400e;margin-top:6px;">${body.claims.length}</div>
                </div>
              </td>
              <td width="33%" style="padding:4px;">
                <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;text-align:center;">
                  <div style="font-size:11px;text-transform:uppercase;color:#075985;letter-spacing:0.5px;font-weight:600;">Oldest Claim</div>
                  <div style="font-size:20px;font-weight:700;color:#075985;margin-top:6px;">${oldest} days</div>
                </div>
              </td>
            </tr>
          </table>

          ${
            breaches > 0
              ? `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;margin:0 0 24px;">
                  <strong style="color:#991b1b;">⚠ IRDAI SLA breach:</strong>
                  <span style="color:#7f1d1d;">${breaches} claim${breaches === 1 ? "" : "s"} pending beyond the regulatory 15-day TAT.</span>
                </div>`
              : ""
          }

          ${detailSection}

          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#475569;">
            We kindly request your support in processing these pending claims within the next <strong>5 working days</strong>. Once processed, it would be a great help if you could share the UTR details with us.
          </p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#475569;">
            An Excel sheet with a complete claim-wise breakdown and details is attached for your ease of reference. This includes all the necessary information to help expedite the process.
          </p>

          <div style="background:#f8fafc;border-radius:8px;padding:14px 16px;margin:18px 0 8px;font-size:13px;color:#475569;">
            <strong style="color:#0f172a;">Hospital SPOC:</strong> ${body.spocName ?? "—"}<br/>
            <strong style="color:#0f172a;">Email:</strong> ${body.spocEmail ?? "—"}
          </div>

          <p style="margin:24px 0 0;font-size:14px;color:#475569;">
            Looking forward to your positive response and continued partnership.<br/><br/>
            Thanks &amp; Regards,<br/>
            <strong style="color:#0f172a;">Billing &amp; Claims Team</strong><br/>
            ${hospital}
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e5e7eb;">
          This is an automated reminder from RCM Buddy. Detailed claim-wise list is attached as Excel.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Allow either an authenticated user (UI invocation) or the cron dispatcher.
  const gate = await requireUserOrCron(req);
  if (gate instanceof Response) return gate;

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
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.recipientEmail || !body.insurerName || !Array.isArray(body.claims)) {
    return new Response(
      JSON.stringify({ error: "recipientEmail, insurerName and claims are required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (body.claims.length === 0) {
    return new Response(
      JSON.stringify({ error: "No outstanding claims to report for this insurer." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Resolve sender (per-user SMTP if available, else platform Resend sandbox)
  let actingUser: AppUserRow | null = null;
  if (body.actingUserId) {
    if (gate.user) {
      const aclErr = await assertCallerCanActAs(supabase, gate.user, body.actingUserId);
      if (aclErr) return aclErr;
    }
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
    const xlsxBase64 = buildExcel(body.insurerName, body.claims);
    const fmt = body.bodyFormat ?? "html";
    let html: string;
    let textPart: string | undefined;
    if (body.customBody) {
      if (fmt === "text") {
        const escaped = body.customBody
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f7fb;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;"><div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);"><pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.6;margin:0;">${escaped}</pre></div></body></html>`;
        textPart = body.customBody;
      } else {
        // Raw HTML — use as-is so the user can paste/compose rich markup
        html = /<html[\s>]/i.test(body.customBody)
          ? body.customBody
          : `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f7fb;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;"><div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">${body.customBody}</div></body></html>`;
      }
    } else {
      html = buildEmailHtml(body);
    }
    const today = new Date().toISOString().slice(0, 10);
    const total = body.claims.reduce((s, c) => s + c.outstanding_amount, 0);

    const useSandbox = sender.mode === "resend";
    const baseSubject = body.customSubject
      ?? `Outstanding Claims Reminder · ${body.insurerName} · ${inr(total)} pending`;
    const subject = useSandbox ? `[TEST → ${body.recipientEmail}] ${baseSubject}` : baseSubject;
    const to = useSandbox ? [SANDBOX_RECIPIENT] : [body.recipientEmail];
    const cc = useSandbox ? undefined : body.ccEmails?.filter(Boolean);

    const result = await sendWithSender(
      sender,
      {
        to, cc, subject, html, text: textPart,
        attachments: [{
          filename: `Outstanding-Claims-${body.insurerName.replace(/[^a-z0-9]+/gi, "-")}-${today}.xlsx`,
          content: xlsxBase64,
        }],
      },
      RESEND_API_KEY,
      LOVABLE_API_KEY,
    );

    if (!result.ok) {
      const errMsg = result.error ?? "Email send failed";
      if (body.reminderId) {
        await supabase
          .from("outstanding_reminders")
          .update({ status: "failed", error_message: errMsg })
          .eq("id", body.reminderId);
      }
      return new Response(JSON.stringify({ success: false, error: errMsg, via: result.via }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.reminderId) {
      await supabase
        .from("outstanding_reminders")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", body.reminderId);
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId ?? null, via: result.via }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (body.reminderId) {
      await supabase
        .from("outstanding_reminders")
        .update({ status: "failed", error_message: msg })
        .eq("id", body.reminderId);
    }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});