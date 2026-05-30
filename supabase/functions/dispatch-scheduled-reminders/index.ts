// Cron-triggered dispatcher: looks for `outstanding_reminders` rows
// where status='scheduled' and scheduled_at <= now(), then invokes
// `send-outstanding-reminder` for each one. Designed to run every minute.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: due, error } = await supabase
    .from("outstanding_reminders")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(20);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const r of due ?? []) {
    try {
      const payload = (r.payload as Record<string, unknown>) ?? {};
      const invokeBody = { ...payload, reminderId: r.id };

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-outstanding-reminder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(invokeBody),
      });
      const data = await resp.json();
      results.push({ id: r.id, ok: resp.ok, error: resp.ok ? undefined : JSON.stringify(data) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      results.push({ id: r.id, ok: false, error: msg });
      await supabase
        .from("outstanding_reminders")
        .update({ status: "failed", error_message: msg })
        .eq("id", r.id);
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
