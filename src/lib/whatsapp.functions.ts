/**
 * Server function: send a WhatsApp template message via Meta Cloud API.
 * Reads WHATSAPP_TOKEN and WHATSAPP_PHONE_ID from project secrets at call time.
 *
 * Auth: requires an authenticated session AND membership in the target org.
 * The org-membership check is enforced via a SELECT against organization_members
 * using the caller's bearer token (RLS scopes the row to the caller).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  to: z.string().min(8).max(20).regex(/^[0-9]+$/, "Digits only, no + sign"),
  template_name: z.string().min(1).max(100),
  variables: z.array(z.string().max(500)).max(20).default([]),
  language_code: z.string().min(2).max(10).default("en"),
  org_id: z.string().uuid(),
});

export interface SendWhatsAppResult {
  ok: boolean;
  message_id?: string;
  error?: string;
}

export const sendWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<SendWhatsAppResult> => {
    // Verify the caller is a member of the target org. RLS on
    // organization_members restricts the SELECT to the caller's own rows.
    const { data: membership, error: memErr } = await context.supabase
      .from("organization_members")
      .select("org_id")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (memErr) {
      return { ok: false, error: `Membership check failed: ${memErr.message}` };
    }
    if (!membership) {
      return { ok: false, error: "Forbidden: not a member of this organization" };
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    if (!token || !phoneId) {
      return { ok: false, error: "WhatsApp API not configured" };
    }

    const body = {
      messaging_product: "whatsapp",
      to: data.to,
      type: "template",
      template: {
        name: data.template_name,
        language: { code: data.language_code },
        components: data.variables.length
          ? [
              {
                type: "body",
                parameters: data.variables.map((v) => ({ type: "text", text: v })),
              },
            ]
          : undefined,
      },
    };

    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
      }
      return { ok: true, message_id: json.messages?.[0]?.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  });
