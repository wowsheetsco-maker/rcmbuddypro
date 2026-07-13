import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ActionCentreCounts {
  overdueFollowUps: number;
  irdaiBreaches: number;
  recoveryAtRisk: number;
  docsToSubmit: number;
  loading: boolean;
}


const SETTLED = new Set([
  "settled",
  "paid",
  "closed",
  "claim settled",
]);

/**
 * Live counts for the global Action Centre bar.
 *  - overdueFollowUps: follow-ups whose next_action_date is in the past and the
 *    claim is not yet settled.
 *  - irdaiBreaches: claims flagged is_irdai_breach and still open.
 *  - recoveryAtRisk: total outstanding across non-settled claims.
 */
export function useActionCentreCounts(): ActionCentreCounts {
  const [state, setState] = useState<ActionCentreCounts>({
    overdueFollowUps: 0,
    irdaiBreaches: 0,
    recoveryAtRisk: 0,
    docsToSubmit: 0,
    loading: true,
  });


  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [followUpsRes, claimsRes] = await Promise.all([
        supabase
          .from("follow_ups")
          .select("id, claim_id, next_action_date, claims!inner(claim_status)")
          .lte("next_action_date", today),
        supabase
          .from("claims")
          .select("id, claim_status, is_irdai_breach, outstanding_amount, approved_amount, claimed_amount, date_of_discharge")
          .limit(5000),

      ]);

      if (cancelled) return;

      // Overdue: only count follow-ups for claims that are NOT settled,
      // and dedupe by claim_id (latest overdue per claim).
      const overdueClaims = new Set<string>();
      for (const row of (followUpsRes.data ?? []) as Array<{
        claim_id: string;
        claims: { claim_status: string } | null;
      }>) {
        const status = (row.claims?.claim_status || "").toLowerCase().trim();
        if (!SETTLED.has(status)) overdueClaims.add(row.claim_id);
      }

      let irdai = 0;
      let outstanding = 0;
      for (const c of (claimsRes.data ?? []) as Array<{
        claim_status: string;
        is_irdai_breach: boolean;
        outstanding_amount: number;
      }>) {
        const status = (c.claim_status || "").toLowerCase().trim();
        const open = !SETTLED.has(status);
        if (open && c.is_irdai_breach) irdai += 1;
        if (open) outstanding += c.outstanding_amount || 0;
      }

      setState({
        overdueFollowUps: overdueClaims.size,
        irdaiBreaches: irdai,
        recoveryAtRisk: outstanding,
        loading: false,
      });
    };

    void load();

    // Refresh every 60s so badges stay fresh while user is on a page
    const id = setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}
