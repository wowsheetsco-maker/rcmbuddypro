/**
 * Meta WhatsApp Cloud API delivery webhook.
 * - GET:  verification handshake (hub.verify_token)
 * - POST: status callbacks → updates discrepancy_action_log rows by provider_message_id
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface MetaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
  errors?: { title?: string; message?: string; code?: number }[];
}

interface MetaWebhookBody {
  entry?: {
    changes?: {
      value?: {
        statuses?: MetaStatus[];
      };
    }[];
  }[];
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // skip if not configured (dev)
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/hooks/whatsapp-delivery")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.WHATSAPP_VERIFY_TOKEN;
        if (mode === "subscribe" && token && expected && token === expected) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const raw = await request.text();
        const sig = request.headers.get("x-hub-signature-256");
        if (!verifySignature(raw, sig)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: MetaWebhookBody;
        try {
          payload = JSON.parse(raw) as MetaWebhookBody;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const statuses: MetaStatus[] = [];
        for (const entry of payload.entry ?? []) {
          for (const change of entry.changes ?? []) {
            for (const s of change.value?.statuses ?? []) statuses.push(s);
          }
        }

        for (const s of statuses) {
          const update: Record<string, unknown> = {};
          if (s.status === "delivered" || s.status === "read") {
            update.status = "delivered";
            update.delivered_at = new Date().toISOString();
          } else if (s.status === "failed") {
            update.status = "failed";
            update.failed_at = new Date().toISOString();
            update.error_message =
              s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? "Delivery failed";
          } else if (s.status === "sent") {
            update.status = "sent";
          }
          if (Object.keys(update).length === 0) continue;
          const { error } = await supabaseAdmin
            .from("discrepancy_action_log")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update(update as any)
            .eq("provider_message_id", s.id);
          if (error) console.error("[whatsapp-delivery] update failed", s.id, error.message);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
