// Sends a single consolidated "Discrepancy Notice" email to a TPA / Insurer
// listing all selected discrepant claims, with a detailed Excel attachment.
// One email per TPA — supports multi-TPA invocations by calling once per group.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { resolveSender, sendWithSender, type AppUserRow } from "../_shared/smtpSender.ts";
import { requireUser, assertCallerCanActAs } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SANDBOX_RECIPIENT = "rcmbuddy.in@gmail.com";

interface DiscrepantClaim {
  claim_id: string;
  claim_number: string;
  patient_name: string;
  policy_number: string | null;
  date_of_admission: string | null;
  date_of_discharge: string | null;
  approved_amount: number;
  settled_amount: number;
  tds_amount: number;
  discrepancy_amount: number;
  discrepancy_pct: number;
  band: "low" | "medium" | "high";
  claim_status: string;
}

interface RequestBody {
  insurerName: string;
  recipientEmail: string;
  ccEmails?: string[];
  hospitalName?: string;
  spocName?: string;
  spocEmail?: string;
  tone?: "formal" | "urgent" | "irdai" | "friendly";
  customSubject?: string;
  customBody?: string; // plain text -> wrapped in HTML
  remarks?: string;
  claims: DiscrepantClaim[];
  actingUserId?: string | null;
}

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function buildExcel(insurerName: string, claims: DiscrepantClaim[]): string {
  const rows = claims.map((c, i) => ({
    "S.No": i + 1,
    "Claim Number": c.claim_number,
    "Patient Name": c.patient_name,
    "Policy Number": c.policy_number ?? "—",
    "Admission": c.date_of_admission ?? "—",
    "Discharge": c.date_of_discharge ?? "—",
    "Approved (INR)": c.approved_amount,
    "Settled (INR)": c.settled_amount,
    "TDS (INR)": c.tds_amount,
    "Discrepancy (INR)": c.discrepancy_amount,
    "Discrepancy %": Number(c.discrepancy_pct.toFixed(2)),
    "Severity": c.band.toUpperCase(),
    "Status": c.claim_status,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 6 }, { wch: 16 }, { wch: 24 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Discrepancy Claims");

  const total = claims.reduce((s, c) => s + c.discrepancy_amount, 0);
  const high = claims.filter((c) => c.band === "high").length;
  const med = claims.filter((c) => c.band === "medium").length;
  const low = claims.filter((c) => c.band === "low").length;
  const summary = [
    ["Insurer / TPA", insurerName],
    ["Report Generated", new Date().toLocaleString("en-IN")],
    ["Total Discrepant Claims", claims.length],
    ["Total Discrepancy Amount (INR)", total],
    ["HIGH severity", high],
    ["MEDIUM severity", med],
    ["LOW severity", low],
  ];
  const sws = XLSX.utils.aoa_to_sheet(summary);
  sws["!cols"] = [{ wch: 32 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, sws, "Summary");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

function buildEmailHtml(body: RequestBody): string {
  const total = body.claims.reduce((s, c) => s + c.discrepancy_amount, 0);
  const high = body.claims.filter((c) => c.band === "high").length;
  const top = [...body.claims]
    .sort((a, b) => b.discrepancy_amount - a.discrepancy_amount)
    .slice(0, 5);
  const hospital = body.hospitalName ?? "Our Hospital";

  const topRows = top
    .map(
      (c) => `
      <tr>
        <td style="padding:9px 12px;border-bottom:1px solid #eee;font-family:monospace;font-size:13px;">${c.claim_number}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #eee;font-size:13px;">${c.patient_name}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px;">${inr(c.approved_amount)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px;">${inr(c.settled_amount + c.tds_amount)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700;color:#b91c1c;font-size:13px;">${inr(c.discrepancy_amount)}</td>
        <td style="padding:9px 12px;border-bottom:1px solid #eee;text-align:center;font-size:12px;">
          <span style="background:${c.band === "high" ? "#fee2e2" : c.band === "medium" ? "#fef3c7" : "#dcfce7"};color:${c.band === "high" ? "#991b1b" : c.band === "medium" ? "#92400e" : "#166534"};padding:3px 8px;border-radius:4px;font-weight:600;">${c.band.toUpperCase()} · ${c.discrepancy_pct.toFixed(1)}%</span>
        </td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 16px;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#7f1d1d 0%,#b91c1c 100%);padding:26px 32px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:2px;opacity:0.85;text-transform:uppercase;">Discrepancy / Short-Payment Notice</div>
          <div style="font-size:22px;font-weight:700;margin-top:6px;">${hospital}</div>
          <div style="font-size:13px;margin-top:4px;opacity:0.9;">Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</div>
        </td></tr>
        <tr><td style="padding:26px 32px;">
          <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Dear <strong>${body.spocName ?? "Claims Team"}</strong>,</p>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#475569;">
            On reconciliation of settled claims from <strong style="color:#0f172a;">${body.insurerName}</strong>, we have identified
            <strong style="color:#b91c1c;">${body.claims.length} claim${body.claims.length === 1 ? "" : "s"}</strong>
            where the actual settlement is short of the approved amount (after TDS).
            The total short-payment is <strong style="color:#b91c1c;">${inr(total)}</strong>.
          </p>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;">
            <tr>
              <td width="33%" style="padding:4px;">
                <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;text-align:center;">
                  <div style="font-size:11px;text-transform:uppercase;color:#991b1b;letter-spacing:0.5px;font-weight:600;">Total Discrepancy</div>
                  <div style="font-size:20px;font-weight:700;color:#991b1b;margin-top:6px;">${inr(total)}</div>
                </div>
              </td>
              <td width="33%" style="padding:4px;">
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;text-align:center;">
                  <div style="font-size:11px;text-transform:uppercase;color:#92400e;letter-spacing:0.5px;font-weight:600;">Discrepant Claims</div>
                  <div style="font-size:20px;font-weight:700;color:#92400e;margin-top:6px;">${body.claims.length}</div>
                </div>
              </td>
              <td width="33%" style="padding:4px;">
                <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;text-align:center;">
                  <div style="font-size:11px;text-transform:uppercase;color:#075985;letter-spacing:0.5px;font-weight:600;">High Severity</div>
                  <div style="font-size:20px;font-weight:700;color:#075985;margin-top:6px;">${high}</div>
                </div>
              </td>
            </tr>
          </table>

          ${body.remarks ? `<div style="background:#fefce8;border-left:4px solid #ca8a04;padding:12px 16px;border-radius:4px;margin:0 0 22px;font-size:13px;color:#713f12;">
            <strong>Remarks:</strong> ${body.remarks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </div>` : ""}

          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#475569;margin:0 0 10px;">Top 5 Discrepancies (full list attached)</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:22px;">
            <thead><tr style="background:#f8fafc;">
              <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Claim #</th>
              <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Patient</th>
              <th style="padding:9px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;">Approved</th>
              <th style="padding:9px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;">Settled+TDS</th>
              <th style="padding:9px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;">Discrepancy</th>
              <th style="padding:9px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#64748b;">Band</th>
            </tr></thead>
            <tbody>${topRows}</tbody>
          </table>

          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#475569;">
            <strong style="color:#0f172a;">Action requested:</strong> Kindly review the attached discrepancy sheet,
            re-process the short-paid amounts, and share UTR / acknowledgement at the earliest.
          </p>

          <div style="background:#f8fafc;border-radius:8px;padding:14px 16px;margin:18px 0 8px;font-size:13px;color:#475569;">
            <strong style="color:#0f172a;">Hospital SPOC:</strong> ${body.spocName ?? "—"}<br/>
            <strong style="color:#0f172a;">Email:</strong> ${body.spocEmail ?? "—"}
          </div>

          <p style="margin:24px 0 0;font-size:14px;color:#475569;">
            Thanks &amp; Regards,<br/>
            <strong style="color:#0f172a;">Billing &amp; Reconciliation Team</strong><br/>
            ${hospital}
          </p>
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 32px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e5e7eb;">
          Automated discrepancy notice from RCM Buddy. Full claim-wise details in attached Excel.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

  if (!body.recipientEmail || !body.insurerName || !Array.isArray(body.claims) || body.claims.length === 0) {
    return new Response(
      JSON.stringify({ error: "recipientEmail, insurerName and at least one claim are required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Resolve sender (per-user SMTP if available, else platform Resend sandbox)
  let actingUser: AppUserRow | null = null;
  if (body.actingUserId) {
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
    const html = body.customBody
      ? `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f7fb;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a;"><div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);"><div style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${body.customBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div></div></body></html>`
      : buildEmailHtml(body);
    const today = new Date().toISOString().slice(0, 10);
    const total = body.claims.reduce((s, c) => s + c.discrepancy_amount, 0);

    const useSandbox = sender.mode === "resend";
    const baseSubject = body.customSubject
      ?? `Discrepancy Notice · ${body.insurerName} · ${body.claims.length} claims · ${inr(total)}`;
    const subject = useSandbox ? `[TEST → ${body.recipientEmail}] ${baseSubject}` : baseSubject;
    const to = useSandbox ? [SANDBOX_RECIPIENT] : [body.recipientEmail];
    const cc = useSandbox ? undefined : body.ccEmails?.filter(Boolean);

    const result = await sendWithSender(
      sender,
      {
        to, cc, subject, html,
        attachments: [{
          filename: `Discrepancy-${body.insurerName.replace(/[^a-z0-9]+/gi, "-")}-${today}.xlsx`,
          content: xlsxBase64,
        }],
      },
      RESEND_API_KEY,
      LOVABLE_API_KEY,
    );

    if (!result.ok) {
      return new Response(
        JSON.stringify({ success: false, error: result.error, via: result.via }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Audit log: one row per claim, all sharing the same bulk_batch_id
    const batchId = crypto.randomUUID();
    const logs = body.claims.map((c) => ({
      claim_id: c.claim_id,
      action_type: "bulk_email",
      channel: "email",
      recipient: body.recipientEmail,
      tone: body.tone ?? "formal",
      subject,
      body_preview: (body.customBody ?? "Consolidated discrepancy notice").slice(0, 240),
      bulk_batch_id: batchId,
      notes: body.remarks ?? null,
      performed_by: actingUser?.email ?? null,
    }));
    await supabase.from("discrepancy_action_log").insert(logs);

    // Bump email_sent_count + last_action on each discrepancy_actions row
    for (const c of body.claims) {
      const { data: existing } = await supabase
        .from("discrepancy_actions")
        .select("id, email_sent_count")
        .eq("claim_id", c.claim_id)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("discrepancy_actions")
          .update({
            email_sent_count: (existing.email_sent_count ?? 0) + 1,
            last_action_type: "bulk_email",
            last_action_at: new Date().toISOString(),
            status: "reviewed",
          })
          .eq("id", existing.id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, messageId: result.messageId ?? null, via: result.via, batchId, count: body.claims.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
