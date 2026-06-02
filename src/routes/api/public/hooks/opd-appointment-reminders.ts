import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Marks appointment provider-confirmation reminder windows:
 *   - 24h reminder: scheduled_at is within next 22-26h, not yet confirmed, not yet flagged.
 *   - Same-day reminder: scheduled_at is today, in the next 0-12h, not yet confirmed, not yet flagged.
 *
 * Intended to be invoked by pg_cron every 15 minutes. Auth bypassed via /api/public prefix;
 * the request is idempotent and only updates timestamp fields.
 */
export const Route = createFileRoute("/api/public/hooks/opd-appointment-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const now = new Date();
        const in22h = new Date(now.getTime() + 22 * 3600 * 1000).toISOString();
        const in26h = new Date(now.getTime() + 26 * 3600 * 1000).toISOString();
        const in12h = new Date(now.getTime() + 12 * 3600 * 1000).toISOString();
        const nowIso = now.toISOString();

        // 24h-out reminders
        const r24 = await supabaseAdmin
          .from("opd_appointments")
          .update({ reminder_24h_sent_at: nowIso })
          .in("status", ["booked", "confirmed"])
          .is("reminder_24h_sent_at", null)
          .is("provider_confirmed_at", null)
          .gte("scheduled_at", in22h)
          .lte("scheduled_at", in26h)
          .select("id");

        // Same-day reminders (next 12h)
        const rSame = await supabaseAdmin
          .from("opd_appointments")
          .update({ reminder_same_day_sent_at: nowIso })
          .in("status", ["booked", "confirmed"])
          .is("reminder_same_day_sent_at", null)
          .is("provider_confirmed_at", null)
          .gte("scheduled_at", nowIso)
          .lte("scheduled_at", in12h)
          .select("id");

        return new Response(
          JSON.stringify({
            ok: true,
            ran_at: nowIso,
            marked_24h: r24.data?.length ?? 0,
            marked_same_day: rSame.data?.length ?? 0,
            errors: [r24.error?.message, rSame.error?.message].filter(Boolean),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
