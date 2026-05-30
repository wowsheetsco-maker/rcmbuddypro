import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import rcmLogo from "@/assets/rcm-buddy-logo.png";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo:
      typeof search.returnTo === "string"
        ? search.returnTo
        : typeof search.redirect === "string"
          ? search.redirect
          : "/launch",
  }),
  head: () => ({
    meta: [
      { title: "Sign In — RCM Buddy" },
      { name: "description", content: "Sign in to RCM Buddy Pro." },
    ],
  }),
  component: LoginPage,
});

function safeRedirectTarget(raw: string | undefined): string {
  if (!raw || typeof raw !== "string") return "/launch";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/launch";
  return raw;
}

const RESEND_COOLDOWN_SECONDS = 30;

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const redirectTo = safeRedirectTarget(search.returnTo);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sendingMagicLink, setSendingMagicLink] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const cooldownTimerRef = useRef<number | null>(null);

  // Handle verification / magic-link callback tokens in the URL hash.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token") && !hash.includes("error")) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const errDesc = params.get("error_description");
    if (errDesc) {
      setError(decodeURIComponent(errDesc.replace(/\+/g, " ")));
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  // If already authenticated, send straight to the intended destination.
  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (cancelled) return;
      (navigate as unknown as (opts: { to: string; replace?: boolean }) => void)({
        to: redirectTo,
        replace: true,
      });
    };
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        finish();
      } else {
        setCheckingSession(false);
      }
    });
    // Catch the SIGNED_IN event fired right after the magic-link/verification
    // callback exchanges the hash tokens for a session.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) finish();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate, redirectTo]);

  // Resend cooldown tick.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownTimerRef.current = window.setTimeout(
      () => setResendCooldown((s) => s - 1),
      1000
    );
    return () => {
      if (cooldownTimerRef.current) window.clearTimeout(cooldownTimerRef.current);
    };
  }, [resendCooldown]);

  const sendMagicLink = useCallback(async () => {
    const { error: magicError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/login?returnTo=${encodeURIComponent(redirectTo)}`,
        shouldCreateUser: true,
      },
    });
    return magicError;
  }, [email, redirectTo]);

  const handleMagicLink = useCallback(async () => {
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }
    setSendingMagicLink(true);
    const magicError = await sendMagicLink();
    setSendingMagicLink(false);
    if (magicError) {
      setError(magicError.message);
      return;
    }
    setMagicLinkSent(true);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    toast({
      title: "Magic link sent",
      description: "Check your inbox and click the link to sign in.",
    });
  }, [email, sendMagicLink]);

  const handleResendMagicLink = useCallback(async () => {
    if (resendCooldown > 0) return;
    setError(null);
    setSendingMagicLink(true);
    const magicError = await sendMagicLink();
    setSendingMagicLink(false);
    if (magicError) {
      setError(magicError.message);
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    toast({ title: "Magic link resent", description: "Check your inbox again." });
  }, [resendCooldown, sendMagicLink]);

  const handleResendVerification = useCallback(async () => {
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }
    setResendingVerification(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/login?returnTo=${encodeURIComponent(redirectTo)}`,
      },
    });
    setResendingVerification(false);
    if (resendError) {
      setError(resendError.message);
      return;
    }
    toast({
      title: "Verification email sent",
      description: "Check your inbox to confirm your email, then sign in.",
    });
  }, [email, redirectTo]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setNeedsVerification(false);

      if (!email.trim()) {
        setError("Please enter your email address.");
        return;
      }
      if (!password) {
        setError("Please enter your password.");
        return;
      }

      setSigningIn(true);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setSigningIn(false);

      if (signInError) {
        const msg = signInError.message || "";
        if (/confirm/i.test(msg) || /not.*verified/i.test(msg) || /email.*not.*confirmed/i.test(msg)) {
          setNeedsVerification(true);
          setError("Your email isn't confirmed yet. Resend the verification email or sign in with a magic link.");
        } else {
          setError(msg);
        }
        return;
      }

      (navigate as unknown as (opts: { to: string; replace?: boolean }) => void)({
        to: redirectTo,
        replace: true,
      });
    },
    [email, password, navigate, redirectTo]
  );

  const handleForgotPassword = useCallback(async () => {
    setError(null);
    if (!email.trim()) {
      setError("Please enter your email address first.");
      return;
    }

    setResetting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/login` }
    );
    setResetting(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    toast({
      title: "Password reset sent",
      description: "Check your inbox for the reset link.",
    });
  }, [email]);

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const formDisabled = signingIn;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src={rcmLogo}
            alt="RCM Buddy — Revenue Care for Healthcare"
            className="mb-3 h-24 w-auto"
          />
          <p className="mt-1 text-sm text-muted-foreground">
            Hospital Revenue Cycle Management
          </p>
        </div>

        <div className="rounded-[calc(var(--radius))] border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-card-foreground">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {usePassword
              ? "Enter your credentials to access the dashboard."
              : "We'll email you a one-tap link — no password needed."}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@hospital.in"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                  if (magicLinkSent) setMagicLinkSent(false);
                  if (needsVerification) setNeedsVerification(false);
                }}
                autoComplete="email"
                disabled={formDisabled}
                className="h-10"
              />
            </div>

            {usePassword && (
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    autoComplete="current-password"
                    disabled={formDisabled}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    tabIndex={-1}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {needsVerification && (
              <Button
                type="button"
                variant="outline"
                onClick={handleResendVerification}
                disabled={resendingVerification}
                className="w-full h-10"
              >
                {resendingVerification ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending verification…
                  </>
                ) : (
                  <>
                    <MailCheck className="mr-2 h-4 w-4" />
                    Resend verification email
                  </>
                )}
              </Button>
            )}

            <div className="space-y-3 pt-1">
              {usePassword ? (
                <Button
                  type="submit"
                  disabled={formDisabled}
                  className="w-full h-10 btn-primary-grad"
                >
                  {signingIn ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              ) : magicLinkSent ? (
                <div className="space-y-2">
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Magic link sent to <span className="font-medium text-foreground">{email.trim()}</span>. Check your inbox.
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleResendMagicLink}
                    disabled={resendCooldown > 0 || sendingMagicLink}
                    className="w-full h-10"
                  >
                    {sendingMagicLink ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resending…
                      </>
                    ) : resendCooldown > 0 ? (
                      `Resend magic link (${resendCooldown}s)`
                    ) : (
                      "Resend magic link"
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={handleMagicLink}
                  disabled={sendingMagicLink}
                  className="w-full h-10 btn-primary-grad"
                >
                  {sendingMagicLink ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending magic link…
                    </>
                  ) : (
                    "Email me a magic link"
                  )}
                </Button>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setUsePassword((v) => !v);
                    setError(null);
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  {usePassword ? "Use magic link instead" : "Use password instead"}
                </button>
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Need help? Contact your hospital admin or IT support.
        </p>
      </div>
    </div>
  );
}
