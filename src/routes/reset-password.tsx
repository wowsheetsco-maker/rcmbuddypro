import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import rcmLogo from "@/assets/rcm-buddy-logo.png";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set a new password — RCM Buddy" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supabase puts a recovery token in the URL hash and exchanges it for a
  // short-lived session. Wait for that before showing the form.
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setHasRecoverySession(!!data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasRecoverySession(true);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords don't match.");
        return;
      }
      setSaving(true);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setDone(true);
      setTimeout(() => {
        (navigate as unknown as (o: { to: string; replace?: boolean }) => void)(
          { to: "/", replace: true }
        );
      }, 1500);
    },
    [password, confirm, navigate]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link to="/">
            <img src={rcmLogo} alt="RCM Buddy" className="h-16 w-auto" />
          </Link>
        </div>

        <div className="rounded-[calc(var(--radius))] border border-border bg-card p-6 shadow-sm">
          {!ready ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : done ? (
            <div className="space-y-3 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/10">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <h2 className="font-display-serif text-2xl">Password updated</h2>
              <p className="text-sm text-muted-foreground">
                Taking you to your dashboard…
              </p>
            </div>
          ) : !hasRecoverySession ? (
            <div className="space-y-3 text-center">
              <h2 className="font-display-serif text-2xl">Link expired</h2>
              <p className="text-sm text-muted-foreground">
                This password reset link is invalid or has expired. Request a new
                one and try again.
              </p>
              <Link to="/forgot-password" className="block">
                <Button className="btn-primary-grad w-full">
                  Request a new link
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <h2 className="font-display-serif text-2xl">Set a new password</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a strong password — at least 8 characters.
              </p>
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      autoComplete="new-password"
                      disabled={saving}
                      className="h-10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      tabIndex={-1}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={show ? "Hide" : "Show"}
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      if (error) setError(null);
                    }}
                    autoComplete="new-password"
                    disabled={saving}
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
                  disabled={saving}
                  className="btn-primary-grad h-10 w-full"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating…
                    </>
                  ) : (
                    "Update password"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
