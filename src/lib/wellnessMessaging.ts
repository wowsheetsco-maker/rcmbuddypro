/**
 * Client-side helpers to open the user's mail / WhatsApp / phone app pre-filled
 * with the right message. This works without any email-send infra and matches
 * the workflow the user asked for ("send confirmation msg and mail to client").
 */

export interface RequestMsgCtx {
  clientName: string;
  providerName?: string;
  serviceName?: string;
  scheduledAt?: string | null;
  reportUrl?: string | null;
}

const fmtWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "to be scheduled";

export function buildConfirmation(ctx: RequestMsgCtx) {
  const subject = `Your ${ctx.serviceName ?? "appointment"} is confirmed`;
  const body = `Hi ${ctx.clientName},

Your ${ctx.serviceName ?? "appointment"}${ctx.providerName ? ` with ${ctx.providerName}` : ""} is confirmed for ${fmtWhen(ctx.scheduledAt)}.

Please reach 15 minutes early. Reply to this message if you need to reschedule.

Thank you.`;
  return { subject, body };
}

export function buildReschedule(ctx: RequestMsgCtx) {
  const subject = `Your ${ctx.serviceName ?? "appointment"} has been rescheduled`;
  const body = `Hi ${ctx.clientName},

Your ${ctx.serviceName ?? "appointment"} has been rescheduled to ${fmtWhen(ctx.scheduledAt)}.

Please confirm receipt. Reach out if this slot doesn't work for you.

Thank you.`;
  return { subject, body };
}

export function buildCancellation(ctx: RequestMsgCtx) {
  const subject = `Your ${ctx.serviceName ?? "appointment"} has been cancelled`;
  const body = `Hi ${ctx.clientName},

Your ${ctx.serviceName ?? "appointment"} scheduled for ${fmtWhen(ctx.scheduledAt)} has been cancelled.

Please contact us if you'd like to book a new slot.

Thank you.`;
  return { subject, body };
}

export function buildReport(ctx: RequestMsgCtx) {
  const subject = `Your ${ctx.serviceName ?? "consultation"} report`;
  const body = `Hi ${ctx.clientName},

Your report for the ${ctx.serviceName ?? "consultation"}${ctx.providerName ? ` (${ctx.providerName})` : ""} is ready.

Download here: ${ctx.reportUrl ?? "(link will be provided)"}

Please reach out for any clarifications.

Thank you.`;
  return { subject, body };
}

export function mailto(to: string | null | undefined, subject: string, body: string) {
  const t = to ?? "";
  return `mailto:${t}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function whatsappLink(phone: string | null | undefined, message: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function telLink(phone: string | null | undefined) {
  return `tel:${(phone ?? "").replace(/\s/g, "")}`;
}
