/**
 * Server function: send a WhatsApp template message via Meta Cloud API.
 * Reads WHATSAPP_TOKEN and WHATSAPP_PHONE_ID from project secrets at call time.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<SendWhatsAppResult> => {
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
