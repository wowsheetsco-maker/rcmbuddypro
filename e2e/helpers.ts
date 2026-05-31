import { test as base, expect, type Page, type Route } from "@playwright/test";

const SUPABASE_HOST = "bvfzexofdfwwnwnmcsja.supabase.co";

type MockState = {
  /** Number of /auth/v1/resend calls observed. */
  resendCount: number;
  /** Number of /auth/v1/token (password sign-in) calls observed. */
  tokenCount: number;
  /** Behaviour switch — when true, password sign-in returns "email not confirmed". */
  emailNotConfirmed: boolean;
};

export type Fixtures = {
  mock: MockState;
};

/**
 * Playwright fixture that intercepts every Supabase Auth REST call so tests
 * never hit the real backend. Adjust the `mock` state per test to drive
 * different flows.
 */
export const test = base.extend<Fixtures>({
  mock: async ({ page }, use) => {
    const state: MockState = {
      resendCount: 0,
      tokenCount: 0,
      emailNotConfirmed: true,
    };

    const json = (route: Route, status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });

    await page.route(`https://${SUPABASE_HOST}/**`, async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();

      if (method === "OPTIONS") {
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers": "*",
          },
        });
      }

      // Password sign-in.
      if (path.endsWith("/auth/v1/token")) {
        state.tokenCount += 1;
        if (state.emailNotConfirmed) {
          return json(route, 400, {
            error: "invalid_grant",
            error_description: "Email not confirmed",
            msg: "Email not confirmed",
            code: "email_not_confirmed",
          });
        }
        return json(route, 200, {
          access_token: "fake",
          refresh_token: "fake",
          token_type: "bearer",
          expires_in: 3600,
          user: { id: "u1", email: "test@example.com" },
        });
      }

      // Resend verification.
      if (path.endsWith("/auth/v1/resend")) {
        state.resendCount += 1;
        return json(route, 200, {});
      }

      // Magic link / OTP signin.
      if (path.endsWith("/auth/v1/otp")) {
        return json(route, 200, {});
      }

      // Session probe — always "no session" so guarded routes redirect.
      if (path.endsWith("/auth/v1/user")) {
        return json(route, 401, { message: "Not authenticated" });
      }

      // Default: empty success.
      return json(route, 200, {});
    });

    await use(state);
  },
});

export { expect };

export async function gotoLogin(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
}

export async function triggerEmailNotConfirmed(page: Page) {
  await gotoLogin(page);
  await page.getByRole("button", { name: /use password instead/i }).click();
  await page.getByLabel("Email").fill("test@example.com");
  await page.getByLabel("Password").fill("hunter22hunter");
  await page.getByRole("button", { name: /^sign in$/i }).click();
}
