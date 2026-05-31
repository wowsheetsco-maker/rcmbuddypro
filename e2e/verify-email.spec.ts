import { test, expect, gotoLogin, triggerEmailNotConfirmed } from "./helpers";

test.describe("Verify-your-email flow", () => {
  test("shows verify screen when sign-in fails with email_not_confirmed", async ({
    page,
    mock,
  }) => {
    await triggerEmailNotConfirmed(page);

    const screen = page.getByTestId("verify-email-screen");
    await expect(screen).toBeVisible();
    await expect(
      screen.getByRole("heading", { name: /verify your email/i })
    ).toBeVisible();
    await expect(screen).toContainText("test@example.com");

    // The heading should receive focus for SR / keyboard users.
    await expect(
      screen.getByRole("heading", { name: /verify your email/i })
    ).toBeFocused();

    expect(mock.tokenCount).toBe(1);
  });

  test("resend verification triggers cooldown countdown", async ({
    page,
    mock,
  }) => {
    await triggerEmailNotConfirmed(page);

    const resend = page.getByTestId("resend-verification");
    await expect(resend).toBeEnabled();
    await resend.click();

    // After clicking, cooldown starts; button shows "Resend verification (Ns)".
    await expect(resend).toBeDisabled();
    await expect(resend).toHaveText(/Resend verification \(\d+s\)/);
    expect(mock.resendCount).toBe(1);

    // Cooldown countdown is exposed to AT via aria-live sr-only hint.
    const hint = page.locator("#verify-cooldown-hint");
    await expect(hint).toHaveAttribute("aria-live", "polite");

    // Number ticks down at least once within a few seconds.
    const first = (await resend.textContent()) ?? "";
    await page.waitForTimeout(1500);
    const second = (await resend.textContent()) ?? "";
    expect(first).not.toBe(second);
  });

  test("expiry countdown renders with aria-live and a <time> element", async ({
    page,
  }) => {
    await triggerEmailNotConfirmed(page);
    await page.getByTestId("resend-verification").click();

    const expiry = page.getByTestId("verify-expiry");
    await expect(expiry).toBeVisible();
    await expect(expiry).toHaveAttribute("role", "status");
    await expect(expiry).toHaveAttribute("aria-live", "polite");
    await expect(expiry.locator("time")).toBeVisible();
    await expect(expiry).toContainText(/Link expires in \d+:\d{2}/);
  });

  test("Back to sign in returns to the form and clears expiry state", async ({
    page,
  }) => {
    await triggerEmailNotConfirmed(page);
    await page.getByTestId("resend-verification").click();
    await expect(page.getByTestId("verify-expiry")).toBeVisible();

    await page.getByTestId("back-to-signin").click();
    await expect(page.getByTestId("verify-email-screen")).toBeHidden();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("resend button is keyboard reachable and activatable", async ({
    page,
  }) => {
    await triggerEmailNotConfirmed(page);
    const resend = page.getByTestId("resend-verification");
    await resend.focus();
    await expect(resend).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(resend).toBeDisabled(); // cooldown engaged
  });
});

test.describe("Login page baseline", () => {
  test("renders and exposes the magic-link primary action", async ({ page }) => {
    await gotoLogin(page);
    await expect(
      page.getByRole("button", { name: /email me a magic link/i })
    ).toBeVisible();
  });
});
