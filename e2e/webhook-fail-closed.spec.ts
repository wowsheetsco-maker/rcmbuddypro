/**
 * Fail-closed contract tests for public webhook endpoints.
 *
 * Hits /api/public/hooks/dispatch-notifications and team-digests on the live
 * dev server (or E2E_BASE_URL) WITHOUT a valid secret/token and asserts the
 * endpoints reject the call. The intent is to catch regressions where a
 * future edit accidentally drops the auth gate and turns these into open
 * public endpoints.
 *
 * Expected outcomes:
 *   - DISPATCH_WEBHOOK_SECRET / TEAM_DIGEST_WEBHOOK_TOKEN not set on the
 *     deployment        → 503 "not configured" (fail-closed, no work done)
 *   - secret/token present but caller omits or sends wrong value
 *                       → 401 Unauthorized
 *   - never 200 without a correct shared secret.
 */
import { test, expect, request } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";

test.describe("public webhook auth — fail closed", () => {
  test("dispatch-notifications rejects requests with no secret", async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${BASE}/api/public/hooks/dispatch-notifications`);
    // 503 when secret env var is missing on the deployment, 401 when set
    // and we just didn't send it. Either is a passing fail-closed state.
    expect([401, 503]).toContain(res.status());
    expect(res.status()).not.toBe(200);
    const body = await res.json().catch(() => ({}));
    expect(body).not.toHaveProperty("inserted");
  });

  test("dispatch-notifications rejects requests with a wrong secret", async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${BASE}/api/public/hooks/dispatch-notifications`, {
      headers: { "x-webhook-secret": "definitely-not-the-secret" },
    });
    expect([401, 503]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });

  test("team-digests rejects requests with no token", async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(`${BASE}/api/public/hooks/team-digests?cadence=daily`);
    expect([401, 503]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });

  test("team-digests rejects requests with a wrong token", async () => {
    const ctx = await request.newContext();
    const res = await ctx.post(
      `${BASE}/api/public/hooks/team-digests?cadence=daily&token=wrong-token`,
    );
    expect([401, 503]).toContain(res.status());
    expect(res.status()).not.toBe(200);
  });

  test("team-digests rejects invalid cadence values even with no token", async () => {
    // The auth gate runs before the cadence check, so we expect auth failure
    // here, NOT a 400 cadence error. Catches a regression where someone
    // reorders the validation and accidentally leaks "is this cadence
    // supported?" probing to unauthenticated callers.
    const ctx = await request.newContext();
    const res = await ctx.post(
      `${BASE}/api/public/hooks/team-digests?cadence=bogus`,
    );
    expect([401, 503]).toContain(res.status());
  });
});
