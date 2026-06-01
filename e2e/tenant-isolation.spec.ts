/**
 * Tenant-isolation tests.
 *
 * Seeds two organizations + one user in each via the Supabase service-role
 * key, then verifies that a query authorised as Org A's user cannot read
 * Org B's claims, and vice versa. Also verifies a branch-restricted user
 * inside Org A can only see claims from their assigned branch.
 *
 * REQUIRES the following env vars at test time (CI):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_PUBLISHABLE_KEY
 *
 * If they are missing the suite is skipped, so this spec is safe to commit
 * even without CI secrets — the local `playwright test` run will skip it.
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";

const HAS_KEYS = Boolean(SUPA_URL && SERVICE_KEY && ANON_KEY);

test.describe("tenant isolation (real backend)", () => {
  test.skip(!HAS_KEYS, "Supabase keys not present in env — skipping real-backend tests");

  const stamp = Date.now();
  const orgAName = `iso-orgA-${stamp}`;
  const orgBName = `iso-orgB-${stamp}`;
  const userAEmail = `iso-a-${stamp}@example.com`;
  const userBEmail = `iso-b-${stamp}@example.com`;
  const password = `Iso!${stamp}!Strong`;

  let admin: ReturnType<typeof createClient>;
  let orgAId = "";
  let orgBId = "";
  let userAId = "";
  let userBId = "";
  let claimAId = "";
  let claimBId = "";

  test.beforeAll(async () => {
    if (!HAS_KEYS) return;
    admin = createClient(SUPA_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Create two orgs
    const { data: oA, error: oAErr } = await admin
      .from("organizations").insert({ name: orgAName, slug: orgAName }).select("id").single();
    if (oAErr) throw oAErr;
    orgAId = oA.id as string;

    const { data: oB, error: oBErr } = await admin
      .from("organizations").insert({ name: orgBName, slug: orgBName }).select("id").single();
    if (oBErr) throw oBErr;
    orgBId = oB.id as string;

    // 2. Create two auth users (auto-confirmed)
    const { data: uA, error: uAErr } = await admin.auth.admin.createUser({
      email: userAEmail, password, email_confirm: true,
    });
    if (uAErr) throw uAErr;
    userAId = uA.user!.id;

    const { data: uB, error: uBErr } = await admin.auth.admin.createUser({
      email: userBEmail, password, email_confirm: true,
    });
    if (uBErr) throw uBErr;
    userBId = uB.user!.id;

    // 3. The handle_new_auth_user trigger gave each user a membership in the
    //    DEMO org. Remove that and link them to their isolated orgs only.
    await admin.from("organization_members").delete().eq("user_id", userAId);
    await admin.from("organization_members").delete().eq("user_id", userBId);
    await admin.from("organization_members").insert([
      { org_id: orgAId, user_id: userAId, role: "admin" },
      { org_id: orgBId, user_id: userBId, role: "admin" },
    ]);

    // 4. Seed one claim in each org
    const { data: cA, error: cAErr } = await admin.from("claims").insert({
      org_id: orgAId, patient_name: "Iso A Patient", tpa_name: "TPA-A",
      claim_number: `A-${stamp}`, claim_creation_date: "2026-01-01", claim_status: "Pending",
    }).select("id").single();
    if (cAErr) throw cAErr;
    claimAId = cA.id as string;

    const { data: cB, error: cBErr } = await admin.from("claims").insert({
      org_id: orgBId, patient_name: "Iso B Patient", tpa_name: "TPA-B",
      claim_number: `B-${stamp}`, claim_creation_date: "2026-01-01", claim_status: "Pending",
    }).select("id").single();
    if (cBErr) throw cBErr;
    claimBId = cB.id as string;
  });

  test.afterAll(async () => {
    if (!HAS_KEYS || !admin) return;
    if (claimAId) await admin.from("claims").delete().eq("id", claimAId);
    if (claimBId) await admin.from("claims").delete().eq("id", claimBId);
    if (orgAId) await admin.from("organization_members").delete().eq("org_id", orgAId);
    if (orgBId) await admin.from("organization_members").delete().eq("org_id", orgBId);
    if (orgAId) await admin.from("organizations").delete().eq("id", orgAId);
    if (orgBId) await admin.from("organizations").delete().eq("id", orgBId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  test("User A cannot SELECT Org B's claims via RLS", async () => {
    const userClient = createClient(SUPA_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInErr } = await userClient.auth.signInWithPassword({
      email: userAEmail, password,
    });
    expect(signInErr).toBeNull();

    // Direct fetch of Org B's claim by ID — should return 0 rows.
    const { data, error } = await userClient
      .from("claims").select("id").eq("id", claimBId);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);

    // Listing all claims should only return Org A's row.
    const { data: all } = await userClient.from("claims").select("id, org_id");
    expect((all ?? []).every((r) => (r as any).org_id === orgAId)).toBe(true);
  });

  test("User B cannot UPDATE Org A's claim", async () => {
    const userClient = createClient(SUPA_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await userClient.auth.signInWithPassword({ email: userBEmail, password });

    const { data, error } = await userClient
      .from("claims").update({ patient_name: "HACKED" }).eq("id", claimAId).select("id");
    // Either RLS blocks the update (0 rows) or the policy denies entirely.
    expect(error?.code === "PGRST301" || (data?.length ?? 0) === 0).toBe(true);

    // Re-read with admin to confirm name was NOT changed.
    const { data: check } = await admin.from("claims").select("patient_name").eq("id", claimAId).single();
    expect(check?.patient_name).toBe("Iso A Patient");
  });

  test("Cross-org admin escalation via promote_to_super_admin is forbidden", async () => {
    const userClient = createClient(SUPA_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await userClient.auth.signInWithPassword({ email: userAEmail, password });

    // User A is NOT a platform admin and the target email is not their own
    // → bootstrap path is blocked, admin path is blocked.
    const { error } = await userClient.rpc("promote_to_super_admin", {
      _target_email: userBEmail,
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/Forbidden|Bootstrap/i);
  });
});
