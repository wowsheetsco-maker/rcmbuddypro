import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Live RLS probe used by the Go/No-Go page.
 * For every public table with an org_id column, verify:
 *   1. rowsecurity is enabled,
 *   2. at least one policy each for SELECT, INSERT, UPDATE, DELETE,
 *   3. each policy's qual references an org helper.
 *
 * Returns { ok, failures[] }. Never throws on policy gaps — only on infra errors.
 *
 * Auth: requires an authenticated user who is a platform admin. The handler
 * uses supabaseAdmin (service-role) for the introspection queries, so the
 * gate is enforced via has_role check against the caller's claims.
 */
export const getPreflightStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Platform-admin gate: verify the caller has a platform_admins row.
    const { data: paRow } = await supabaseAdmin
      .from("platform_admins")
      .select("email")
      .ilike("email", (context.claims.email as string | undefined) ?? "")
      .maybeSingle();
    if (!paRow) {
      return { ok: false, failures: ["Forbidden: platform admin only"] };
    }

  // Tables to skip: not org-scoped or intentionally global.
  const allowlist = new Set([
    "platform_apps",
    "platform_admins",
    "organizations",
    "organization_members",
    "user_notification_prefs",
    "outstanding_notifications",
  ]);

  const failures: string[] = [];

  // 1. Tables with org_id
  const { data: colRows, error: colErr } = await (supabaseAdmin as any)
    .schema("information_schema")
    .from("columns")
    .select("table_name")
    .eq("table_schema", "public")
    .eq("column_name", "org_id");
  
  if (colErr) {
    return { ok: false, failures: [`Schema probe failed: ${colErr.message}`] };
  }
  
  const tableNames: string[] = ((colRows ?? []) as Array<{ table_name: string }>).map((r) => r.table_name);
  const orgTables: string[] = Array.from(new Set<string>(tableNames))
    .filter((t) => !allowlist.has(t))
    .sort();

  // 2. RLS enabled flags
  const { data: rlsRows, error: rlsErr } = await (supabaseAdmin as any)
    .schema("pg_catalog")
    .from("pg_tables")
    .select("tablename, rowsecurity")
    .eq("schemaname", "public");
    
  if (rlsErr) {
    return { ok: false, failures: [`RLS probe failed: ${rlsErr.message}`] };
  }
  
  const rlsMap = new Map<string, boolean>(
    (rlsRows ?? []).map((r: any) => [r.tablename as string, !!r.rowsecurity])
  );

  // 3. Policies
  const { data: polRows, error: polErr } = await (supabaseAdmin as any)
    .schema("pg_catalog")
    .from("pg_policies")
    .select("tablename, cmd, qual, with_check")
    .eq("schemaname", "public");
    
  if (polErr) {
    return { ok: false, failures: [`Policy probe failed: ${polErr.message}`] };
  }
  
  const polByTable = new Map<string, Array<{ cmd: string; qual: string | null; with_check: string | null }>>();
  for (const r of (polRows ?? []) as Array<{ tablename: string; cmd: string; qual: string | null; with_check: string | null }>) {
    const t = r.tablename;
    if (!polByTable.has(t)) polByTable.set(t, []);
    polByTable.get(t)!.push({ cmd: r.cmd, qual: r.qual, with_check: r.with_check });
  }

  const requiredCmds = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
  const helperRe = /(is_org_member|has_org_role|is_platform_admin)\s*\(/;

  for (const t of orgTables) {
    if (!rlsMap.get(t)) {
      failures.push(`${t}: RLS disabled`);
      continue;
    }
    const pols = polByTable.get(t) ?? [];
    for (const cmd of requiredCmds) {
      const matching = pols.filter(
        (p) => p.cmd?.toUpperCase() === cmd || p.cmd?.toUpperCase() === "ALL"
      );
      if (matching.length === 0) {
        failures.push(`${t}: missing ${cmd} policy`);
        continue;
      }
      const hasHelper = matching.some((p) =>
        helperRe.test((p.qual ?? "") + " " + (p.with_check ?? ""))
      );
      if (!hasHelper) {
        failures.push(`${t}: ${cmd} policy missing org helper reference`);
      }
    }
  }

  return { ok: failures.length === 0, failures };
});
