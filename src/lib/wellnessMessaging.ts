/**
 * Wellness messaging helpers.
 *
 * Each message has a kind (confirm/reschedule/cancel/report) and a channel
 * (email/whatsapp). Templates are stored in `wellness_message_templates`;
 * if a custom template isn't found, the built-in defaults below are used.
 *
 * Placeholders supported in template subject/body:
 *   {client_name}, {provider_name}, {service_name}, {scheduled_at}, {report_url}
 */

import { supabase } from "@/integrations/supabase/client";

export type TemplateKind = "confirm" | "reschedule" | "cancel" | "report";
export type TemplateChannel = "email" | "whatsapp";

export interface RequestMsgCtx {
  clientName: string;
  providerName?: string;
  serviceName?: string;
  scheduledAt?: string | null;
  reportUrl?: string | null;
}

const fmtWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "to be scheduled";

export const DEFAULTS: Record<TemplateKind, Record<TemplateChannel, { subject: string; body: string }>> = {
  confirm: {
    email: {
      subject: "Your {service_name} is confirmed",
      body: `Hi {client_name},

Your {service_name}{provider_suffix} is confirmed for {scheduled_at}.

Please reach 15 minutes early. Reply to this message if you need to reschedule.

Thank you.`,
    },
    whatsapp: {
      subject: "",
      body: `Hi {client_name}, your {service_name} is confirmed for {scheduled_at}. Please reach 15 minutes early. Thank you.`,
    },
  },
  reschedule: {
    email: {
      subject: "Your {service_name} has been rescheduled",
      body: `Hi {client_name},

Your {service_name} has been rescheduled to {scheduled_at}.

Please confirm receipt. Reach out if this slot doesn't work for you.

Thank you.`,
    },
    whatsapp: {
      subject: "",
      body: `Hi {client_name}, your {service_name} has been rescheduled to {scheduled_at}. Please confirm.`,
    },
  },
  cancel: {
    email: {
      subject: "Your {service_name} has been cancelled",
      body: `Hi {client_name},

Your {service_name} scheduled for {scheduled_at} has been cancelled.

Please contact us if you'd like to book a new slot.

Thank you.`,
    },
    whatsapp: {
      subject: "",
      body: `Hi {client_name}, your {service_name} scheduled for {scheduled_at} has been cancelled. Contact us to rebook.`,
    },
  },
  report: {
    email: {
      subject: "Your {service_name} report",
      body: `Hi {client_name},

Your report for the {service_name}{provider_suffix} is ready.

Download here: {report_url}

Please reach out for any clarifications.

Thank you.`,
    },
    whatsapp: {
      subject: "",
      body: `Hi {client_name}, your {service_name} report is ready: {report_url}`,
    },
  },
};

function apply(tpl: string, ctx: RequestMsgCtx): string {
  return tpl
    .replaceAll("{client_name}", ctx.clientName)
    .replaceAll("{provider_name}", ctx.providerName ?? "")
    .replaceAll("{provider_suffix}", ctx.providerName ? ` with ${ctx.providerName}` : "")
    .replaceAll("{service_name}", ctx.serviceName ?? "appointment")
    .replaceAll("{scheduled_at}", fmtWhen(ctx.scheduledAt))
    .replaceAll("{report_url}", ctx.reportUrl ?? "(link will be provided)");
}

interface CachedTemplate { subject: string | null; body: string }
type TemplateMap = Partial<Record<`${TemplateKind}:${TemplateChannel}`, CachedTemplate>>;

let cache: TemplateMap | null = null;
let cacheAt = 0;

export async function loadTemplates(force = false): Promise<TemplateMap> {
  if (!force && cache && Date.now() - cacheAt < 60_000) return cache;
  const { data } = await supabase
    .from("wellness_message_templates" as never)
    .select("kind,channel,subject,body");
  const map: TemplateMap = {};
  for (const r of (data ?? []) as Array<{ kind: TemplateKind; channel: TemplateChannel; subject: string | null; body: string }>) {
    map[`${r.kind}:${r.channel}`] = { subject: r.subject, body: r.body };
  }
  cache = map; cacheAt = Date.now();
  return map;
}

export function invalidateTemplateCache() { cache = null; }

export function renderTemplate(
  kind: TemplateKind, channel: TemplateChannel, ctx: RequestMsgCtx, templates?: TemplateMap,
): { subject: string; body: string } {
  const custom = templates?.[`${kind}:${channel}`];
  const def = DEFAULTS[kind][channel];
  const subject = apply(custom?.subject ?? def.subject, ctx);
  const body = apply(custom?.body ?? def.body, ctx);
  return { subject, body };
}

// Legacy default builders (kept for callers that don't yet pass templates)
export const buildConfirmation = (ctx: RequestMsgCtx) => renderTemplate("confirm", "email", ctx);
export const buildReschedule  = (ctx: RequestMsgCtx) => renderTemplate("reschedule", "email", ctx);
export const buildCancellation = (ctx: RequestMsgCtx) => renderTemplate("cancel", "email", ctx);
export const buildReport       = (ctx: RequestMsgCtx) => renderTemplate("report", "email", ctx);

export function mailto(to: string | null | undefined, subject: string, body: string) {
  return `mailto:${to ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function whatsappLink(phone: string | null | undefined, message: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
export function telLink(phone: string | null | undefined) {
  return `tel:${(phone ?? "").replace(/\s/g, "")}`;
}
