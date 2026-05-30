// Onboarding checklist modal — shown automatically to brand-new organisations
// the first time they log in, until all 5 setup steps are complete (or the
// org owner has clicked "Skip for now"). See useOnboardingChecklist for the
// logic and conditions.

import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useOnboardingChecklist } from "@/hooks/useOnboardingChecklist";

export default function OnboardingChecklistModal() {
  const { open, steps, completedCount, allDone, firstRunCompleted, dismiss } =
    useOnboardingChecklist();

  // Fire success toast + auto-dismiss when the flag flips to completed.
  const celebrated = useRef(false);
  useEffect(() => {
    if (firstRunCompleted && !celebrated.current && open) {
      celebrated.current = true;
      toast.success("🎉 You're all set! Welcome to RCM Buddy Pro.");
      // Auto-dismiss shortly after, so the user can see the green checks.
      const t = setTimeout(() => dismiss(), 1500);
      return () => clearTimeout(t);
    }
  }, [firstRunCompleted, open, dismiss]);

  if (!open) return null;

  const total = steps.length;
  const progress = Math.round((completedCount / total) * 100);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Welcome — let's get you set up
          </DialogTitle>
          <DialogDescription>
            Complete these {total} steps to unlock the full RCM Buddy workflow.
            We'll tick each off automatically as you finish.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{completedCount}</span> of {total} complete
            </span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />

          <ul className="space-y-2 pt-1">
            {steps.map((step, idx) => (
              <li
                key={step.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border p-3 transition-colors",
                  step.done ? "bg-success/5 border-success/30" : "bg-card",
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step.done
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground border",
                  )}
                  aria-hidden
                >
                  {step.done ? <Check className="h-4 w-4" /> : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-sm font-medium",
                      step.done && "line-through text-muted-foreground",
                    )}
                  >
                    {step.title}
                  </div>
                </div>
                {!step.done && (
                  <Link to={step.href} onClick={() => dismiss()}>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
                      Start <ArrowRight className="h-3 w-3" />
                    </Button>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          <Button variant="ghost" onClick={dismiss}>
            Skip for now
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            {allDone ? "All done — closing…" : "We'll keep this checklist until you finish."}
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
