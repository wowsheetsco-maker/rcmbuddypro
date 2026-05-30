/**
 * WhatsApp helpers.
 *
 * Two send paths:
 *   - wa.me deep link (default; works on mobile + desktop, no API keys)
 *   - WhatsApp Business API via Meta Cloud (enabled when
 *     VITE_WHATSAPP_API_ENABLED=true) — see src/lib/whatsapp.functions.ts
 *
 * Call sites use openWhatsApp() for deep-link, sendWhatsApp() server fn
 * for the Business API path. UI components can call isWhatsAppApiEnabled()
 * to decide which to use, and keep a "Send from device" fallback button.
 */

import { formatInrShort } from "@/data/mockClaims";
import { supabase } from "@/integrations/supabase/client";

/** Strip everything that isn't a digit; keep a leading + for E.164 detection. */
function digitsOnly(raw: string): string {
  return (raw || "").replace(/[^\d+]/g, "");
}

/**
 * Normalize an Indian phone number to the international form wa.me expects
 * (no plus sign, country code prefixed). Returns null when the input is
 * obviously not a phone number we can dial.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = digitsOnly(raw);
  if (!cleaned) return null;

  if (cleaned.startsWith("+")) {
    const d = cleaned.slice(1);
    return d.length >= 10 && d.length <= 15 ? d : null;
  }
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) return `91${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("0")) return `91${cleaned.slice(1)}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return cleaned;
  if (cleaned.length >= 11 && cleaned.length <= 15) return cleaned;
  return null;
}

/** Build a wa.me URL with an optional pre-filled message. */
export function buildWhatsAppUrl(rawNumber: string | null | undefined, message?: string): string | null {
  const num = normalizeWhatsAppNumber(rawNumber);
  if (!num) return null;
  const base = `https://wa.me/${num}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Open a WhatsApp chat in a new tab; returns false if number invalid. */
export function openWhatsApp(rawNumber: string | null | undefined, message?: string): boolean {
  const url = buildWhatsAppUrl(rawNumber, message);
  if (!url) return false;
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

// ---------- Template variable resolution ----------

export interface ClaimContext {
  patient_name?: string | null;
  claim_number?: string | null;
  hospital_name?: string | null;
  outstanding_amount?: number | null;
  days_since_claim?: number | null;
  tpa_name?: string | null;
  tpa_spoc_name?: string | null;
  insurance_company_name?: string | null;
  last_communication_note?: string | null;
}

/** Replace {{token}} placeholders. Unknown tokens render as "—". */
export function renderTemplate(body: string, ctx: ClaimContext): string {
  const map: Record<string, string> = {
    patient_name: ctx.patient_name ?? "—",
    claim_number: ctx.claim_number ?? "—",
    hospital_name: ctx.hospital_name ?? "the hospital",
    tpa_name: ctx.tpa_name ?? "your TPA",
    tpa_spoc_name: ctx.tpa_spoc_name ?? "Sir/Madam",
    insurance_company_name: ctx.insurance_company_name ?? "the insurer",
    outstanding_amount:
      typeof ctx.outstanding_amount === "number" && ctx.outstanding_amount > 0
        ? formatInrShort(ctx.outstanding_amount)
        : "—",
    days_since_claim:
      typeof ctx.days_since_claim === "number" ? String(ctx.days_since_claim) : "—",
    last_communication_note: ctx.last_communication_note ?? "—",
  };
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => map[key] ?? "—");
}

/** Extract every distinct {{token}} used in a body. */
export function extractTokens(body: string): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([a-z_]+)\s*\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.add(m[1].toLowerCase());
  return Array.from(out);
}

// ---------- Built-in fallbacks (used when DB unreachable) ----------

/** Polite TPA/insurer follow-up nudge — kept for back-compat with existing call sites. */
export function tpaFollowUpMessage(c: ClaimContext): string {
  return renderTemplate(
    `Hello {{tpa_spoc_name}},

Following up on claim *{{claim_number}}* for patient *{{patient_name}}*.
Hospital: {{hospital_name}}
Outstanding: *{{outstanding_amount}}*
Aging: {{days_since_claim}} days

Could you please share the current status / expected settlement date?
Thank you.`,
    c,
  );
}

/** Friendly patient nudge for missing documents. */
export function patientDocsMessage(c: ClaimContext): string {
  return renderTemplate(
    `Hello {{patient_name}},

This is from the hospital billing team regarding your insurance claim *{{claim_number}}*.
We're awaiting a few documents to process your claim with {{tpa_name}}.

Please share them at your earliest convenience.
Thank you.`,
    c,
  );
}

// ---------- Click logging ----------

export interface LogWhatsAppClickInput {
  claim_id: string;
  recipient: string;
  template_name?: string | null;
  audience_role?: string | null;
  body_preview: string;
  performed_by?: string | null;
  /** When sending via Business API, "queued"; for wa.me deep-links, "sent". */
  status?: "queued" | "sent" | "delivered" | "failed";
  provider_message_id?: string | null;
  error_message?: string | null;
}

/**
 * Logs a WhatsApp open/send into discrepancy_action_log so it shows up in the
 * Communication Log on the claim drawer. Best-effort — never throws to the UI.
 * Returns the inserted row id (or null on failure) so callers can later patch
 * it with the provider's message id once the API responds.
 */
export async function logWhatsAppClick(input: LogWhatsAppClickInput): Promise<string | null> {
  try {
    const { getCurrentOrgId } = await import("@/lib/currentOrg");
    const { data, error } = await supabase
      .from("discrepancy_action_log")
      .insert({
        org_id: getCurrentOrgId(),
        claim_id: input.claim_id,
        action_type: "whatsapp_sent",
        channel: "whatsapp",
        recipient: input.recipient,
        tone: input.audience_role ?? null,
        subject: input.template_name ?? "WhatsApp message",
        body_preview: input.body_preview.slice(0, 1200),
        performed_by: input.performed_by ?? null,
        status: input.status ?? "sent",
        provider_message_id: input.provider_message_id ?? null,
        error_message: input.error_message ?? null,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  } catch (err) {
    console.warn("logWhatsAppClick failed", err);
    return null;
  }
}

/** Patch an existing comm-log row with the provider's message id / status. */
export async function updateWhatsAppLog(
  rowId: string,
  patch: { status?: string; provider_message_id?: string | null; error_message?: string | null },
): Promise<void> {
  try {
    await supabase
      .from("discrepancy_action_log")
      .update(patch as never)
      .eq("id", rowId);
  } catch (err) {
    console.warn("updateWhatsAppLog failed", err);
  }
}

/** True when the WhatsApp Business API path is enabled via env flag. */
export function isWhatsAppApiEnabled(): boolean {
  return import.meta.env.VITE_WHATSAPP_API_ENABLED === "true";
}

