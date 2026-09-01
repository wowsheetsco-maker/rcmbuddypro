/**
 * Automated multi-tenant RLS isolation suite.
 *
 * Seeds three hospitals (A, B, C) with one user each and one row per module
 * (claims, claim documents, submissions, follow-ups/billing, staff users,
 * KPI/dashboard rows, import history, access requests), then asserts — as
 * each signed-in user — that:
 *
 *   - list reads return ONLY their own hospital's rows,
 *   - direct-by-id reads of another hospital's row return 0 rows,
 *   - search/filter queries cannot leak another hospital's rows,
 *   - dashboard aggregates and export-shaped reads are hospital-scoped,
 *   - cross-tenant writes (insert/update/delete) are refused,
 *   - the organizations/members directory is hospital-scoped,
 *   - access requests are only visible to their own requester/hospital admins.
 *
 * REQUIRES at test time:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY
 * Without them the suite skips, so it is safe to commit.
 *
 * Run: bunx playwright test e2e/rls-isolation.spec.ts
 */
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const HAS_KEYS = Boolean(SUPA_URL && SERVICE_KEY && ANON_KEY);

type Tenant = {
  key: "A" | "B" | "C";
  orgId: string;
  userId: string;
  email: string;
  claimId: string;
  submissionId: string;
  documentId: string;
  followUpId: string;
  appUserId: string;
  kpiId: string;
  importId: string;
  client: SupabaseClient;
};

const stamp = Date.now();
const password = `Rls!${stamp}!Strong`;

test.describe.configure({ mode: "serial" });

test.describe("RLS isolation across hospitals", () => {
  test.skip(!HAS_KEYS, "Supabase keys not present in env — skipping real-backend RLS tests");

  let admin: SupabaseClient;
  const tenants: Tenant[] = [];

  const other = (t: Tenant) => tenants.find((x) => x.key !== t.key)!;

  test.beforeAll(async () => {
    if (!HAS_KEYS) return;
    admin = createClient(SUPA_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    for (const key of ["A", "B", "C"] as const) {
      const name = `rls-${key}-${stamp}`;
      const email = `rls-${key.toLowerCase()}-${stamp}@example.com`;

      const { data: org, error: orgErr } = await admin
        .from("organizations")
        .insert({ name, slug: name })
        .select("id")
        .single();
      if (orgErr) throw orgErr;
      const orgId = org!.id as string;

      const { data: created, error: userErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (userErr) throw userErr;
      const userId = created.user!.id;

      // Guarantee exactly one membership: the tenant's own hospital.
      await admin.from("organization_members").delete().eq("user_id", userId);
      const { error: memErr } = await admin
        .from("organization_members")
        .insert({ org_id: orgId, user_id: userId, role: "admin" });
      if (memErr) throw memErr;

      const { data: claim, error: claimErr } = await admin
        .from("claims")
        .insert({
          org_id: orgId,
          patient_name: `Patient ${key}`,
          tpa_name: `TPA-${key}`,
          claim_number: `${key}-${stamp}`,
          claim_creation_date: "2026-01-01",
          claim_status: "Claim Submitted",
          claim_amount: 100000,
          approved_amount: 90000,
          date_of_admission: "2026-01-01",
          date_of_discharge: "2026-01-05",
        })
        .select("id")
        .single();
      if (claimErr) throw claimErr;
      const claimId = claim!.id as string;

      const { data: submission, error: subErr } = await admin
        .from("claim_submissions")
        .insert({ org_id: orgId, claim_id: claimId, status: "pending" })
        .select("id")
        .single();
      if (subErr) throw subErr;

      const { data: doc, error: docErr } = await admin
        .from("claim_documents")
        .insert({
          org_id: orgId,
          claim_id: claimId,
          file_name: `discharge-${key}.pdf`,
          storage_path: `${orgId}/discharge-${key}.pdf`,
        })
        .select("id")
        .single();
      if (docErr) throw docErr;

      const { data: followUp, error: fuErr } = await admin
        .from("follow_ups")
        .insert({
          org_id: orgId,
          claim_id: claimId,
          channel: "email",
          notes: `follow-up ${key}`,
        })
        .select("id")
        .single();
      if (fuErr) throw fuErr;

      const { data: appUser, error: auErr } = await admin
        .from("app_users")
        .insert({
          org_id: orgId,
          auth_user_id: userId,
          name: `Staff ${key}`,
          email,
          role: "Hospital Admin",
          status: "active",
        })
        .select("id")
        .single();
      if (auErr) throw auErr;

      const { data: kpi, error: kpiErr } = await admin
        .from("hospital_kpis")
        .insert({ org_id: orgId, period: "2026-01", metric: "claims_total", value: 1 })
        .select("id")
        .single();
      if (kpiErr) throw kpiErr;

      const { data: imp, error: impErr } = await admin
        .from("import_history")
        .insert({ org_id: orgId, file_name: `import-${key}.csv`, row_count: 1 })
        .select("id")
        .single();
      if (impErr) throw impErr;

      const client = createClient(SUPA_URL, ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;

      tenants.push({
        key,
        orgId,
        userId,
        email,
        claimId,
        submissionId: submission!.id as string,
        documentId: doc!.id as string,
        followUpId: followUp!.id as string,
        appUserId: appUser!.id as string,
        kpiId: kpi!.id as string,
        importId: imp!.id as string,
        client,
      });
    }
  });

  test.afterAll(async () => {
    if (!HAS_KEYS || !admin) return;
    for (const t of tenants) {
      await admin.from("access_requests").delete().eq("org_id", t.orgId);
      await admin.from("follow_ups").delete().eq("org_id", t.orgId);
      await admin.from("claim_documents").delete().eq("org_id", t.orgId);
      await admin.from("claim_submission_events").delete().eq("org_id", t.orgId);
      await admin.from("claim_submission_documents").delete().eq("org_id", t.orgId);
      await admin.from("claim_submissions").delete().eq("org_id", t.orgId);
      await admin.from("claims").delete().eq("org_id", t.orgId);
      await admin.from("hospital_kpis").delete().eq("org_id", t.orgId);
      await admin.from("import_history").delete().eq("org_id", t.orgId);
      await admin.from("app_users").delete().eq("org_id", t.orgId);
      await admin.from("organization_members").delete().eq("org_id", t.orgId);
      await admin.from("organizations").delete().eq("id", t.orgId);
      await admin.auth.admin.deleteUser(t.userId);
    }
  });

  test("each user has exactly one hospital membership", async () => {
    for (const t of tenants) {
      const { data, error } = await t.client.from("organization_members").select("org_id");
      expect(error).toBeNull();
      expect(data?.length).toBe(1);
      expect(data![0].org_id).toBe(t.orgId);
    }
  });

  test("organizations directory is hospital-scoped", async () => {
    for (const t of tenants) {
      const { data } = await t.client.from("organizations").select("id");
      const ids = (data ?? []).map((r) => r.id as string);
      expect(ids).toContain(t.orgId);
      for (const o of tenants.filter((x) => x.key !== t.key)) {
        expect(ids).not.toContain(o.orgId);
      }
    }
  });

  const tables = [
    { table: "claims", idOf: (t: Tenant) => t.claimId },
    { table: "claim_submissions", idOf: (t: Tenant) => t.submissionId },
    { table: "claim_documents", idOf: (t: Tenant) => t.documentId },
    { table: "follow_ups", idOf: (t: Tenant) => t.followUpId },
    { table: "app_users", idOf: (t: Tenant) => t.appUserId },
    { table: "hospital_kpis", idOf: (t: Tenant) => t.kpiId },
    { table: "import_history", idOf: (t: Tenant) => t.importId },
  ] as const;

  for (const { table, idOf } of tables) {
    test(`${table}: list reads return only own hospital rows`, async () => {
      for (const t of tenants) {
        const { data, error } = await t.client.from(table).select("id, org_id");
        expect(error).toBeNull();
        expect((data ?? []).every((r) => (r as { org_id: string }).org_id === t.orgId)).toBe(true);
      }
    });

    test(`${table}: direct record access to another hospital returns nothing`, async () => {
      for (const t of tenants) {
        const o = other(t);
        const { data, error } = await t.client.from(table).select("id").eq("id", idOf(o));
        expect(error).toBeNull();
        expect(data?.length ?? 0).toBe(0);
      }
    });

    test(`${table}: filtering by another hospital's org_id leaks nothing`, async () => {
      for (const t of tenants) {
        const o = other(t);
        const { data } = await t.client.from(table).select("id").eq("org_id", o.orgId);
        expect(data?.length ?? 0).toBe(0);
      }
    });

    test(`${table}: cross-tenant insert is refused`, async () => {
      const t = tenants[0];
      const o = other(t);
      const { error } = await t.client.from(table).insert({ org_id: o.orgId } as never);
      expect(error).not.toBeNull();
    });
  }

  test("claims: text search cannot reach another hospital's patients", async () => {
    for (const t of tenants) {
      const o = other(t);
      const { data } = await t.client
        .from("claims")
        .select("id, patient_name")
        .ilike("patient_name", "Patient %");
      expect((data ?? []).some((r) => r.patient_name === `Patient ${o.key}`)).toBe(false);
    }
  });

  test("claims: cross-tenant update and delete are blocked and data unchanged", async () => {
    const t = tenants[0];
    const o = other(t);

    const { data: upd } = await t.client
      .from("claims")
      .update({ patient_name: "HACKED" })
      .eq("id", o.claimId)
      .select("id");
    expect(upd?.length ?? 0).toBe(0);

    const { data: del } = await t.client.from("claims").delete().eq("id", o.claimId).select("id");
    expect(del?.length ?? 0).toBe(0);

    const { data: check } = await admin
      .from("claims")
      .select("patient_name")
      .eq("id", o.claimId)
      .single();
    expect(check?.patient_name).toBe(`Patient ${o.key}`);
  });

  test("claim_documents: another hospital's document metadata is unreachable by claim id", async () => {
    for (const t of tenants) {
      const o = other(t);
      const { data } = await t.client
        .from("claim_documents")
        .select("id, storage_path")
        .eq("claim_id", o.claimId);
      expect(data?.length ?? 0).toBe(0);
    }
  });

  test("dashboard aggregates are hospital-scoped", async () => {
    for (const t of tenants) {
      const { count, error } = await t.client
        .from("claims")
        .select("id", { count: "exact", head: true });
      expect(error).toBeNull();
      // Each tenant seeded exactly one claim and can see no others.
      expect(count).toBe(1);

      const { data: kpis } = await t.client.from("hospital_kpis").select("org_id, value");
      expect((kpis ?? []).every((r) => r.org_id === t.orgId)).toBe(true);
    }
  });

  test("export-shaped read (wide select + ordering) stays hospital-scoped", async () => {
    for (const t of tenants) {
      const { data, error } = await t.client
        .from("claims")
        .select("id, org_id, claim_number, patient_name, claim_amount, approved_amount, claim_status")
        .order("claim_creation_date", { ascending: false })
        .limit(1000);
      expect(error).toBeNull();
      expect((data ?? []).every((r) => r.org_id === t.orgId)).toBe(true);
      expect((data ?? []).length).toBe(1);
    }
  });

  test("staff users of another hospital are invisible", async () => {
    for (const t of tenants) {
      const o = other(t);
      const { data } = await t.client.from("app_users").select("id, email").eq("email", o.email);
      expect(data?.length ?? 0).toBe(0);
    }
  });

  test("access requests are visible only to the requester and their hospital admins", async () => {
    const [a, b] = tenants;

    const { data: reqRow, error: reqErr } = await admin
      .from("access_requests")
      .insert({
        requester_user_id: b.userId,
        email: `newcomer-${stamp}@example.com`,
        name: "Newcomer",
        org_id: a.orgId,
        requested_org_name: "rls-A",
      })
      .select("id")
      .single();
    expect(reqErr).toBeNull();
    const requestId = reqRow!.id as string;

    // Hospital A's admin sees the request aimed at their hospital.
    const { data: seenByA } = await a.client.from("access_requests").select("id").eq("id", requestId);
    expect(seenByA?.length ?? 0).toBe(1);

    // Hospital C's admin (unrelated hospital) does not.
    const c = tenants[2];
    const { data: seenByC } = await c.client.from("access_requests").select("id").eq("id", requestId);
    expect(seenByC?.length ?? 0).toBe(0);

    // C cannot approve a request for A's hospital.
    const { error: approveErr } = await c.client.rpc("approve_access_request", {
      _request_id: requestId,
    } as never);
    expect(approveErr).not.toBeNull();

    await admin.from("access_requests").delete().eq("id", requestId);
  });

  test("membership-less user sees no hospital data at all", async () => {
    const email = `rls-orphan-${stamp}@example.com`;
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();
    const orphanId = created!.user!.id;
    // The sign-up trigger must not attach an uninvited account to any hospital.
    const { data: memberships } = await admin
      .from("organization_members")
      .select("org_id")
      .eq("user_id", orphanId);
    expect(memberships?.length ?? 0).toBe(0);

    const orphan = createClient(SUPA_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await orphan.auth.signInWithPassword({ email, password });

    for (const table of ["claims", "claim_documents", "claim_submissions", "follow_ups", "app_users", "hospital_kpis", "import_history"] as const) {
      const { data } = await orphan.from(table).select("id");
      expect(data?.length ?? 0).toBe(0);
    }

    await admin.auth.admin.deleteUser(orphanId);
  });
});
