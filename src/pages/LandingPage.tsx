import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import rcmLogo from "@/assets/rcm-buddy-logo.png";


export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
        {/* LEFT — cherry red brand panel */}
        <section className="brand-cherry-panel brand-cherry-grid brand-cherry-glow">
          <div className="relative z-10 flex h-full min-h-screen flex-col p-8 md:p-12 lg:p-14">
            {/* Logo lockup */}
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-white shadow-sm">
                <img src={rcmLogo} alt="RCM Buddy" className="h-9 w-auto" />
              </div>
              <span className="text-lg font-semibold tracking-tight">
                RCM Buddy
              </span>
            </div>

            {/* Headline block */}
            <div className="mt-auto pt-16">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white">
                Hospital Revenue Cycle Management
              </p>
              <h1 className="font-display-serif mt-5 text-5xl leading-[1.05] text-white md:text-6xl lg:text-7xl">
                Get paid for every
                <br />
                claim you raise.
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white">
                Recover insurance claims faster — priority worklists, TPA
                follow-ups, denial appeals and payer scorecards in one workspace
                built for Indian hospitals.
              </p>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-8 text-xs text-white">
              © {new Date().getFullYear()} RCM Buddy — Hospital RCM platform
            </div>
          </div>
        </section>

        {/* RIGHT — light CTA panel */}
        <section className="relative flex items-center justify-center bg-card px-6 py-12 md:px-10">
          <div className="w-full max-w-sm">
            <div className="flex flex-col items-center text-center">
              <img src={rcmLogo} alt="RCM Buddy" className="h-14 w-auto" />
              <h2 className="font-display-serif mt-6 text-3xl tracking-tight text-foreground">
                Welcome to RCM Buddy
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to your hospital workspace or request a guided demo.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              <Link to="/login" search={{ returnTo: "/" }} className="block">
                <Button size="lg" className="btn-primary-grad h-11 w-full">
                  Login
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <RequestDemoDialog />
            </div>

            <div className="mt-8 rounded-lg border border-border bg-background/60 px-4 py-3 text-center text-xs text-muted-foreground">
              Need access? Ask your hospital admin to send you an invite.
            </div>

            <p className="mt-6 text-center text-[11px] text-muted-foreground">
              For support write to{" "}
              <a
                href="mailto:rcmbuddy.in@gmail.com"
                className="text-primary hover:underline"
              >
                rcmbuddy.in@gmail.com
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ───────────────────────── Request Demo ───────────────────────── */

interface DemoForm {
  hospital_name: string;
  contact_name: string;
  email: string;
  phone: string;
  role: string;
  notes: string;
}

const EMPTY: DemoForm = {
  hospital_name: "",
  contact_name: "",
  email: "",
  phone: "",
  role: "",
  notes: "",
};

function RequestDemoDialog() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<DemoForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const update =
    (key: keyof DemoForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      if (error) setError(null);
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const hospital = form.hospital_name.trim();
    const contact = form.contact_name.trim();
    const email = form.email.trim();
    if (!hospital || !contact || !email) {
      setError("Hospital, contact name and email are required.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    const { error: insertError } = await supabase.from("demo_leads").insert({
      hospital_name: hospital.slice(0, 200),
      contact_name: contact.slice(0, 200),
      email: email.slice(0, 254),
      phone: form.phone.trim().slice(0, 32) || null,
      role: form.role.trim().slice(0, 64) || null,
      notes: form.notes.trim().slice(0, 2000) || null,
      source: "landing_page",
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
    });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message || "Couldn't submit. Please try again.");
      return;
    }

    setSubmitted(true);
    toast({
      title: "Thanks — we'll be in touch",
      description: "Our team will reach out within one business day.",
    });
  };

  const reset = () => {
    setForm(EMPTY);
    setSubmitted(false);
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setTimeout(reset, 200);
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg" variant="outline" className="h-11 w-full">
          Request a Demo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {submitted ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-success/10">
              <CheckCircle2 className="h-7 w-7 text-success" />
            </div>
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-center">Request received</DialogTitle>
              <DialogDescription className="text-center">
                Thanks, {form.contact_name.trim().split(" ")[0] || "there"}.
                Our team will reach out to{" "}
                <span className="font-medium text-foreground">
                  {form.email.trim()}
                </span>{" "}
                within one business day to schedule your walkthrough.
              </DialogDescription>
            </DialogHeader>
            <Button className="mt-6 w-full" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-display-serif text-2xl">
                Request a guided demo
              </DialogTitle>
              <DialogDescription>
                Tell us about your hospital — we'll set up a 30-minute session.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              <Field
                label="Hospital name *"
                id="hospital_name"
                value={form.hospital_name}
                onChange={update("hospital_name")}
                placeholder="e.g. Sunrise Multispecialty Hospital"
                disabled={submitting}
                maxLength={200}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Your name *"
                  id="contact_name"
                  value={form.contact_name}
                  onChange={update("contact_name")}
                  placeholder="Full name"
                  disabled={submitting}
                  maxLength={200}
                />
                <Field
                  label="Role"
                  id="role"
                  value={form.role}
                  onChange={update("role")}
                  placeholder="Billing Head"
                  disabled={submitting}
                  maxLength={64}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Work email *"
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={update("email")}
                  placeholder="you@hospital.in"
                  disabled={submitting}
                  maxLength={254}
                />
                <Field
                  label="Phone"
                  id="phone"
                  value={form.phone}
                  onChange={update("phone")}
                  placeholder="+91…"
                  disabled={submitting}
                  maxLength={32}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-sm font-medium">
                  Anything we should know?
                </Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={update("notes")}
                  placeholder="Claim volume, TPAs you work with, biggest pain points…"
                  disabled={submitting}
                  maxLength={2000}
                  rows={3}
                />
              </div>
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="btn-primary-grad"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Request demo"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  id,
  ...rest
}: {
  label: string;
  id: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <Input id={id} {...rest} />
    </div>
  );
}
