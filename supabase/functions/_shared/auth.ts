// Shared auth helpers for edge functions.
// - requireUser: validates the Authorization Bearer JWT against Supabase auth.
// - verifyCronSecret: checks x-cron-secret header against CRON_SECRET env.
// - assertCallerCanActAs: ensures the authenticated user owns the given
//   app_users row, OR is an org admin/owner of the same org.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsAuthHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

export interface AuthedUser {
  id: string;
  email: string | null;
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsAuthHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Validates the incoming request's Authorization: Bearer <jwt> header.
 * Returns the authenticated user, or a Response (401) if invalid.
 */
export async function requireUser(
  req: Request,
): Promise<AuthedUser | Response> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResp(401, { error: "Unauthorized: missing bearer token" });
  }
  const token = authHeader.slice(7);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    "";
  if (!SUPABASE_URL || !ANON_KEY) {
    return jsonResp(500, { error: "Auth not configured" });
  }
  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) {
    return jsonResp(401, { error: "Unauthorized: invalid token" });
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Verifies a shared-secret header for cron/dispatcher functions.
 * Fail-closed: if CRON_SECRET is not configured, refuse every request.
 * Returns null on success, or a Response (401/503) on failure.
 */
export function verifyCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) {
    return jsonResp(503, { error: "CRON_SECRET not configured" });
  }
  const provided =
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret") ??
    "";
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  let ok = a.length === b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) ok = ok && (a[i] ?? 0) === (b[i] ?? 0);
  if (!ok) return jsonResp(401, { error: "Unauthorized" });
  return null;
}

/**
 * Allow either an authenticated user OR a valid cron secret. Useful for
 * functions invoked from both the UI and the cron dispatcher.
 * Returns { user } | { cron: true } on success, or a Response on failure.
 */
export async function requireUserOrCron(
  req: Request,
): Promise<{ user?: AuthedUser; cron?: boolean } | Response> {
  if (req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret")) {
    const cronErr = verifyCronSecret(req);
    if (cronErr) return cronErr;
    return { cron: true };
  }
  const u = await requireUser(req);
  if (u instanceof Response) return u;
  return { user: u };
}

/**
 * Ensures the authenticated caller is allowed to act on behalf of `targetAppUserId`.
 * The caller must either be the same app_users row, OR be an org owner/admin
 * of the same org. Uses a service-role client (RLS bypassed) to look up rows.
 */
export async function assertCallerCanActAs(
  admin: SupabaseClient,
  caller: AuthedUser,
  targetAppUserId: string,
): Promise<Response | null> {
  // 1. Resolve caller's app_users row.
  const { data: callerRow } = await admin
    .from("app_users")
    .select("id, org_id, role")
    .eq("auth_user_id", caller.id)
    .maybeSingle();
  if (!callerRow) {
    return jsonResp(403, { error: "Forbidden: caller has no app_users record" });
  }
  if (callerRow.id === targetAppUserId) return null;

  // 2. Resolve target.
  const { data: targetRow } = await admin
    .from("app_users")
    .select("org_id")
    .eq("id", targetAppUserId)
    .maybeSingle();
  if (!targetRow) {
    return jsonResp(404, { error: "Target user not found" });
  }

  // 3. Caller must be owner/admin in the target's org.
  const { data: membership } = await admin
    .from("organization_members")
    .select("role")
    .eq("user_id", caller.id)
    .eq("org_id", targetRow.org_id)
    .maybeSingle();
  if (membership && (membership.role === "owner" || membership.role === "admin")) {
    return null;
  }
  return jsonResp(403, { error: "Forbidden: cannot act as this user" });
}
