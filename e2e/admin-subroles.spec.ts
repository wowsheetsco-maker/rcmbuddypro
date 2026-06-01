/**
 * Admin sub-role authorization tests (real backend).
 *
 * Seeds one org and three users with different admin sub-roles:
 *   - tech_admin       → can reach /admin/control-panel, NOT /admin/promote
 *   - billing_admin    → can reach /settings/users, NOT /admin/promote
 *   - (no subrole)     → cannot reach any /admin/* admin page
 *
 * Verifies the `has_admin_subrole` SECURITY DEFINER helper agrees with the
 * `ADMIN_ROUTE_SUBROLE_RULES` matrix in src/hooks/useAdminSubroles.ts.
 * Asserting via the RPC keeps the test hermetic (no UI auth flow required)
 * while still catching regressions where the DB grant model diverges from
 * the front-end gate.
 *
 * Skips automatically when SUPABASE_SERVICE_ROLE_KEY is not present.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const HAS_KEYS = Boolean(SUPA_URL && SERVICE_KEY && ANON_KEY);

const SUBROLES_BY_PATH: Record<string, string[]> = {
  "/admin/promote": ["super_admin"],
  "/admin/control-panel": ["super_admin", "org_owner", "tech_admin"],
  "/admin/roles-matrix": ["super_admin", "org_owner", "org_admin"],
  "/settings/users": ["super_admin", "org_owner", "org_admin", "billing_admin"],
};

test.describe("admin sub-role gating (real backend)", () => {
  test.skip(!HAS_KEYS, "Supabase keys not set — skipping");

  const stamp = Date.now();
  const orgName = `subrole-org-${stamp}`;
  const password = `Sub!${stamp}!Strong`;
  const techEmail = `subrole-tech-${stamp}@example.com`;
  const billingEmail = `subrole-bill-${stamp}@example.com`;
  const noneEmail = `subrole-none-${stamp}@example.com`;

  let admin: ReturnType<typeof createClient>;
  let orgId = "";
  let techId = "", billingId = "", noneId = "";

  test.beforeAll(async () => {
    if (!HAS_KEYS) return;
    admin = createClient(SUPA_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: org, error: oErr } = await admin
      .from("organizations").insert({ name: orgName, slug: orgName }).select("id").single();
    if (oErr) throw oErr;
    orgId = org.id as string;

    for (const [email, var_] of [[techEmail, "tech"], [billingEmail, "billing"], [noneEmail, "none"]] as const) {
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      if (error) throw error;
      if (var_ === "tech") techId = data.user!.id;
      if (var_ === "billing") billingId = data.user!.id;
      if (var_ === "none") noneId = data.user!.id;
    }

    // Clean default-org memberships from handle_new_auth_user trigger.
    await admin.from("organization_members").delete().in("user_id", [techId, billingId, noneId]);
    await admin.from("organization_members").insert([
      { org_id: orgId, user_id: techId,    role: "member" },
      { org_id: orgId, user_id: billingId, role: "member" },
      { org_id: orgId, user_id: noneId,    role: "member" },
    ]);

    await admin.from("admin_role_assignments").insert([
      { org_id: orgId, user_id: techId,    subrole: "tech_admin",    granted_by: techId },
      { org_id: orgId, user_id: billingId, subrole: "billing_admin", granted_by: billingId },
    ]);
  });

  test.afterAll(async () => {
    if (!HAS_KEYS || !admin) return;
    await admin.from("admin_role_assignments").delete().eq("org_id", orgId);
    await admin.from("organization_members").delete().eq("org_id", orgId);
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
    for (const uid of [techId, billingId, noneId]) {
      if (uid) await admin.auth.admin.deleteUser(uid);
    }
  });

  async function asUser(email: string) {
    const c = createClient(SUPA_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await c.auth.signInWithPassword({ email, password });
    return c;
  }

  async function canReach(c: ReturnType<typeof createClient>, path: string): Promise<boolean> {
    // Mirror the front-end rule: ANY one of the path's allowed subroles is enough.
    const required = SUBROLES_BY_PATH[path];
    expect(required, `no rule mapped for ${path}`).toBeTruthy();
    for (const sub of required) {
      const { data, error } = await c.rpc("has_admin_subrole", {
        _user_id: (await c.auth.getUser()).data.user!.id,
        _org_id: orgId,
        _subrole: sub,
      });
      if (error) throw error;
      if (data === true) return true;
    }
    return false;
  }

  test("tech_admin can reach /admin/control-panel but NOT /admin/promote", async () => {
    const c = await asUser(techEmail);
    expect(await canReach(c, "/admin/control-panel")).toBe(true);
    expect(await canReach(c, "/admin/promote")).toBe(false);
    expect(await canReach(c, "/admin/roles-matrix")).toBe(false);
  });

  test("billing_admin can reach /settings/users but NOT /admin/control-panel", async () => {
    const c = await asUser(billingEmail);
    expect(await canReach(c, "/settings/users")).toBe(true);
    expect(await canReach(c, "/admin/control-panel")).toBe(false);
    expect(await canReach(c, "/admin/promote")).toBe(false);
  });

  test("plain member with no admin sub-roles is denied every gated /admin path", async () => {
    const c = await asUser(noneEmail);
    for (const path of Object.keys(SUBROLES_BY_PATH)) {
      expect(await canReach(c, path), `path=${path}`).toBe(false);
    }
  });
});
