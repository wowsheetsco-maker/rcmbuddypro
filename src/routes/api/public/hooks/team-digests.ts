// Public webhook for external schedulers (cron-job.org, EasyCron, GitHub
// Actions, n8n, Zapier, etc.) to trigger team digest delivery for any cadence.
//
// Usage from an external scheduler — set up 3 jobs:
//   Daily   (e.g. 08:00 IST):  POST .../api/public/hooks/team-digests?cadence=daily
//   Weekly  (Mon 09:00 IST):    POST .../api/public/hooks/team-digests?cadence=weekly
//   Monthly (1st 09:00 IST):    POST .../api/public/hooks/team-digests?cadence=monthly
//
// Optional query params:
//   token=<webhook secret>   — required if TEAM_DIGEST_WEBHOOK_TOKEN is set on
//                              the deployment for shared-secret protection.
//   orgId=<uuid>             — limit to one org (default: all subscribed orgs).
//
// The route forwards to the `send-team-digest` edge function which uses the
// service-role key and the per-user SMTP / Resend fallback already wired in.

import { createFileRoute } from "@tanstack/react-router";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const WEBHOOK_TOKEN = process.env.TEAM_DIGEST_WEBHOOK_TOKEN ?? "";

type Cadence = "daily" | "weekly" | "monthly";

async function dispatch(cadence: Cadence, orgId?: string) {
  const url = `${SUPABASE_URL}/functions/v1/send-team-digest`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ cadence, trigger: "webhook", orgId }),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function handle(request: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(
      JSON.stringify({ error: "Backend not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL(request.url);
  const cadenceParam = (url.searchParams.get("cadence") ?? "daily") as Cadence;
  const orgId = url.searchParams.get("orgId") ?? undefined;
  const token = url.searchParams.get("token") ?? request.headers.get("x-webhook-token") ?? "";

  if (WEBHOOK_TOKEN && token !== WEBHOOK_TOKEN) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const allowed: Cadence[] = ["daily", "weekly", "monthly"];
  if (!allowed.includes(cadenceParam)) {
    return new Response(JSON.stringify({ error: "cadence must be daily|weekly|monthly" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await dispatch(cadenceParam, orgId);
  return new Response(
    JSON.stringify({ cadence: cadenceParam, orgId: orgId ?? null, ...result }),
    { status: result.ok ? 200 : 502, headers: { "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/public/hooks/team-digests")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
