// Shared helper: send an email using a user's per-user SMTP creds, with
// fallback to platform Resend if the user has no SMTP configured.
// Used by send-ai-draft-email, send-discrepancy-bulk, send-outstanding-reminder.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export interface ResolvedSender {
  mode: "smtp" | "resend";
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  smtp?: {
    host: string;
    port: number;
    username: string;
    password: string;
    useTls: boolean;
  };
}

export interface AppUserRow {
  id: string;
  name: string;
  email: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password: string | null;
  smtp_use_tls: boolean | null;
  smtp_from_name: string | null;
  smtp_from_email: string | null;
  smtp_reply_to: string | null;
  smtp_verified_at: string | null;
}

/** Resolve which sender to use for a given app_user row (or null = no user). */
export function resolveSender(user: AppUserRow | null): ResolvedSender {
  if (
    user &&
    user.smtp_host &&
    user.smtp_port &&
    user.smtp_username &&
    user.smtp_password &&
    user.smtp_verified_at // only use SMTP after a successful test
  ) {
    return {
      mode: "smtp",
      fromName: user.smtp_from_name || user.name,
      fromEmail: user.smtp_from_email || user.smtp_username,
      replyTo: user.smtp_reply_to || undefined,
      smtp: {
        host: user.smtp_host,
        port: user.smtp_port,
        username: user.smtp_username,
        password: user.smtp_password,
        useTls: user.smtp_use_tls ?? true,
      },
    };
  }
  return {
    mode: "resend",
    fromName: "RCM Buddy",
    fromEmail: "onboarding@resend.dev",
  };
}

export interface SendArgs {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: string /* base64 */ }>;
}

/** Send via the resolved sender. Returns { ok, messageId, error }. */
export async function sendWithSender(
  sender: ResolvedSender,
  args: SendArgs,
  resendApiKey: string,
  lovableApiKey: string,
): Promise<{ ok: boolean; messageId?: string; error?: string; via: "smtp" | "resend" }> {
  if (sender.mode === "smtp" && sender.smtp) {
    const client = new SMTPClient({
      connection: {
        hostname: sender.smtp.host,
        port: sender.smtp.port,
        tls: sender.smtp.useTls,
        auth: { username: sender.smtp.username, password: sender.smtp.password },
      },
    });
    try {
      const msg: Record<string, unknown> = {
        from: `${sender.fromName} <${sender.fromEmail}>`,
        to: args.to,
        subject: args.subject,
        html: args.html,
        content: args.text ?? "Please view this email in an HTML-capable client.",
      };
      if (args.cc?.length) msg.cc = args.cc;
      if (sender.replyTo) msg.replyTo = sender.replyTo;
      if (args.attachments?.length) {
        msg.attachments = args.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          encoding: "base64",
        }));
      }
      // deno-lint-ignore no-explicit-any
      await client.send(msg as any);
      await client.close();
      return { ok: true, via: "smtp" };
    } catch (err) {
      try { await client.close(); } catch { /* ignore */ }
      return { ok: false, via: "smtp", error: err instanceof Error ? err.message : "SMTP send failed" };
    }
  }

  // Resend fallback
  const resp = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": resendApiKey,
    },
    body: JSON.stringify({
      from: `${sender.fromName} <${sender.fromEmail}>`,
      to: args.to,
      cc: args.cc?.length ? args.cc : undefined,
      reply_to: sender.replyTo,
      subject: args.subject,
      html: args.html,
      text: args.text,
      attachments: args.attachments?.length ? args.attachments : undefined,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return { ok: false, via: "resend", error: `Resend ${resp.status}: ${JSON.stringify(data)}` };
  }
  return { ok: true, via: "resend", messageId: data?.id };
}
