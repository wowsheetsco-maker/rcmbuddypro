// Test a user's SMTP credentials by opening a connection and sending a tiny
// "you're connected" email back to the same user. On success, stamps
// app_users.smtp_verified_at so the UI can show a green check.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { requireUser, assertCallerCanActAs } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  userId: string;          // app_users.id whose creds to test
  testRecipient?: string;  // optional override; defaults to from_email or smtp_username
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: Body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!body.userId) {
    return new Response(JSON.stringify({ ok: false, error: "userId required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const aclErr = await assertCallerCanActAs(supabase, authed, body.userId);
  if (aclErr) return aclErr;


  const { data: user, error: userErr } = await supabase
    .from("app_users")
    .select("id,name,email,smtp_host,smtp_port,smtp_username,smtp_password,smtp_use_tls,smtp_from_name,smtp_from_email")
    .eq("id", body.userId)
    .maybeSingle();

  if (userErr || !user) {
    return new Response(JSON.stringify({ ok: false, error: userErr?.message ?? "User not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!user.smtp_host || !user.smtp_port || !user.smtp_username || !user.smtp_password) {
    return new Response(JSON.stringify({ ok: false, error: "SMTP credentials incomplete" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const fromEmail = user.smtp_from_email || user.smtp_username;
  const fromName = user.smtp_from_name || user.name || "RCM Buddy";
  const recipient = body.testRecipient || fromEmail;

  const client = new SMTPClient({
    connection: {
      hostname: user.smtp_host,
      port: user.smtp_port,
      tls: user.smtp_use_tls,
      auth: { username: user.smtp_username, password: user.smtp_password },
    },
  });

  try {
    await client.send({
      from: `${fromName} <${fromEmail}>`,
      to: recipient,
      subject: "✅ RCM Buddy — SMTP test successful",
      content: `Hi ${user.name},\n\nYour SMTP connection is configured correctly. You can now send emails from RCM Buddy using ${fromEmail}.\n\n— RCM Buddy`,
      html: `<p>Hi ${user.name},</p><p>Your SMTP connection is configured correctly. You can now send emails from RCM Buddy using <strong>${fromEmail}</strong>.</p><p style="color:#64748b;font-size:12px">— RCM Buddy</p>`,
    });
    await client.close();

    await supabase
      .from("app_users")
      .update({ smtp_verified_at: new Date().toISOString() })
      .eq("id", body.userId);

    return new Response(JSON.stringify({ ok: true, sentTo: recipient }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    try { await client.close(); } catch { /* ignore */ }
    const msg = err instanceof Error ? err.message : "SMTP test failed";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
