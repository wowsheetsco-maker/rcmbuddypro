/**
 * Server function: manually resend a submission reminder for one claim.
 * Inserts in-app notifications and sends email/WhatsApp when those channels
 * are configured for the project AND the recipient has an address/phone on file.
 *
 * Auth: requires an authenticated session AND membership in the submission's org.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendSubmissionReminder } from "@/lib/submissionReminders.server";

const InputSchema = z.object({
  submissionId: z.string().uuid(),
});

export interface ResendSubmissionReminderResult {
  ok: boolean;
  error?: string;
  channels_used?: { in_app: number; email: number; whatsapp: number };
  recipients?: Array<{
    name: string;
    in_app: boolean;
    email?: { ok: boolean; to?: string; error?: string };
    whatsapp?: { ok: boolean; to?: string; error?: string };
  }>;
}

export const resendSubmissionReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ResendSubmissionReminderResult> => {
    // Authorize: caller must be a member of the submission's org.
    const { data: sub, error: subErr } = await context.supabase
      .from("claim_submissions")
      .select("id, org_id")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (subErr) return { ok: false, error: subErr.message };
    if (!sub) return { ok: false, error: "Submission not found or no access" };

    // Look up the caller's app_user id for audit attribution.
    let actorAppUserId: string | null = null;
    const { data: me } = await context.supabase
      .from("app_users")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (me) actorAppUserId = (me as { id: string }).id;

    const result = await sendSubmissionReminder(data.submissionId, {
      trigger: "manual",
      actorAppUserId,
    });
    if (!result) return { ok: false, error: "Failed to load submission" };
    return {
      ok: true,
      channels_used: result.channels_used,
      recipients: result.recipients.map((r) => ({
        name: r.name,
        in_app: r.in_app,
        email: r.email,
        whatsapp: r.whatsapp,
      })),
    };
  });
