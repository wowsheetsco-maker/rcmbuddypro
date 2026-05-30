import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, Loader2, MailCheck } from "lucide-react";
import rcmLogo from "@/assets/rcm-buddy-logo.png";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — RCM Buddy" },
      {
        name: "description",
        content:
          "Reset your RCM Buddy password. We'll email you a secure link to set a new one.",
      },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      const trimmed = email.trim();
      if (!trimmed) {
        setError("Please enter your email address.");
        return;
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
        setError("Please enter a valid email address.");
        return;
      }

      setSending(true);
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmed,
        { redirectTo: `${window.location.origin}/reset-password` }
      );
      setSending(false);

      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSent(true);
    },
    [email]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link to="/" className="inline-block">
            <img src={rcmLogo} alt="RCM Buddy" className="h-16 w-auto" />
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            Hospital Revenue Cycle Management
          </p>
        </div>

        <div className="rounded-[calc(var(--radius))] border border-border bg-card p-6 shadow-sm">
          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/10">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <div>
                <h2 className="font-display-serif text-2xl">Check your email</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  If an account exists for{" "}
                  <span className="font-medium text-foreground">
                    {email.trim()}
                  </span>
                  , you'll receive a password reset link shortly.
                </p>
              </div>
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSent(false);
                    setError(null);
                  }}
                >
                  <MailCheck className="mr-2 h-4 w-4" />
                  Send to a different email
                </Button>
                <Link to="/login" search={{ returnTo: "/" }} className="block">
                  <Button variant="ghost" className="w-full">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to sign in
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="font-display-serif text-2xl">Reset your password</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the email tied to your hospital account and we'll send you a
                secure link.
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
                    }}
                    autoComplete="email"
                    disabled={sending}
                    className="h-10"
                  />
                </div>

                {error && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={sending}
                  className="btn-primary-grad h-10 w-full"
                >
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending reset link…
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </Button>

                <Link
                  to="/login"
                  search={{ returnTo: "/" }}
                  className="block text-center text-sm text-primary hover:underline"
                >
                  ← Back to sign in
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
