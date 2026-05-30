// Onboarding checklist state for brand-new organisations.
//
// Reads the 5 step conditions from the database for the current org, exposes
// completion state, dismissal handling, and writes `first_run_completed=true`
// when all steps pass.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type OnboardingStepId =
  | "branches"
  | "claims"
  | "team"
  | "smtp"
  | "whatsapp";

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  href: string;
  done: boolean;
}

interface State {
  loading: boolean;
  /** True once we've fetched the org row and decided whether to show it. */
  shouldShow: boolean;
  /** Org row's first_run_completed flag. */
  firstRunCompleted: boolean;
  steps: OnboardingStep[];
}

const INITIAL_STEPS: OnboardingStep[] = [
  { id: "branches", title: "Add your hospital branches", href: "/settings/hospital-branches", done: false },
  { id: "claims",   title: "Import your first claims",   href: "/claims/import",                done: false },
  { id: "team",     title: "Add team members",           href: "/settings/users",               done: false },
  { id: "smtp",     title: "Configure email (SMTP)",     href: "/settings/notifications",       done: false },
  { id: "whatsapp", title: "Set up WhatsApp templates",  href: "/settings/whatsapp-templates",  done: false },
];

async function countRows(table: string, orgId: string, extra?: (q: ReturnType<typeof supabase.from>) => unknown): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (supabase as any).from(table).select("*", { count: "exact", head: true }).eq("org_id", orgId);
  if (extra) q = extra(q) as typeof q;
  const { count, error } = await q;
  if (error) {
    console.warn(`[onboarding] count failed for ${table}`, error);
    return 0;
  }
  return count ?? 0;
}

export function useOnboardingChecklist() {
  const { orgId, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<State>({
    loading: true,
    shouldShow: false,
    firstRunCompleted: false,
    steps: INITIAL_STEPS,
  });
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setState((s) => ({ ...s, loading: false, shouldShow: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true }));

    // Read org row
    const { data: org } = await supabase
      .from("organizations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("first_run_completed" as any)
      .eq("id", orgId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstRunCompleted = Boolean((org as any)?.first_run_completed);

    // Count rows for each step in parallel
    const [branches, claims, users, smtpUsers, waTpl] = await Promise.all([
      countRows("hospital_branches", orgId),
      countRows("claims", orgId),
      countRows("app_users", orgId),
      // smtp config lives on app_users.smtp_host
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      countRows("app_users", orgId, (q) => (q as any).not("smtp_host", "is", null)),
      countRows("whatsapp_templates", orgId),
    ]);

    const steps: OnboardingStep[] = [
      { ...INITIAL_STEPS[0], done: branches >= 1 },
      { ...INITIAL_STEPS[1], done: claims >= 1 },
      { ...INITIAL_STEPS[2], done: users >= 2 },
      { ...INITIAL_STEPS[3], done: smtpUsers >= 1 },
      { ...INITIAL_STEPS[4], done: waTpl >= 1 },
    ];

    setState({
      loading: false,
      shouldShow: !firstRunCompleted,
      firstRunCompleted,
      steps,
    });
  }, [orgId]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  // When all 5 steps pass and the flag isn't set yet, mark org as completed.
  useEffect(() => {
    if (state.loading || !orgId || state.firstRunCompleted) return;
    if (state.steps.every((s) => s.done)) {
      void (async () => {
        const { error } = await supabase
          .from("organizations")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ first_run_completed: true } as any)
          .eq("id", orgId);
        if (!error) {
          setState((s) => ({ ...s, firstRunCompleted: true }));
        }
      })();
    }
  }, [state, orgId]);

  const dismiss = useCallback(() => setDismissed(true), []);

  const completedCount = state.steps.filter((s) => s.done).length;
  const open = state.shouldShow && !dismissed;

  return {
    open,
    loading: state.loading,
    steps: state.steps,
    completedCount,
    allDone: completedCount === state.steps.length,
    firstRunCompleted: state.firstRunCompleted,
    dismiss,
    refresh,
  };
}
