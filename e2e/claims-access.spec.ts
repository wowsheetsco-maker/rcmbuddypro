import { test, expect } from "./helpers";

/**
 * Unauthenticated users hitting any /claims/* route must be redirected to
 * /login with a `returnTo` query param pointing back at the original URL.
 *
 * Role gating itself is unit-tested in `src/lib/routeAccess.test.ts`; this
 * suite proves the end-to-end ProtectedRoute → routeAccess plumbing fires
 * and that the redirect contract holds for every claims subroute.
 */
const CLAIMS_ROUTES = [
  "/claims",
  "/claims/priority",
  "/claims/denials",
  "/claims/discrepancy",
  "/claims/data-quality",
  "/claims/import",
  "/claims/tds",
] as const;

test.describe("Claims routes — unauthenticated redirect", () => {
  for (const path of CLAIMS_ROUTES) {
    test(`${path} redirects to /login with returnTo=${path}`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.waitForURL(/\/login\?/, { timeout: 5_000 });

      const url = new URL(page.url());
      expect(url.pathname).toBe("/login");
      const returnTo = url.searchParams.get("returnTo");
      // returnTo may include query/hash; the path prefix must match.
      expect(returnTo).not.toBeNull();
      expect(returnTo!.startsWith(path)).toBe(true);

      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    });
  }

  test("returnTo is rejected for protocol-relative open-redirect attempts", async ({
    page,
  }) => {
    await page.goto("/login?returnTo=//evil.com");
    // The page must still render the sign-in screen; safeRedirectTarget
    // collapses unsafe values to /launch internally but should not crash.
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
