import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DbClaim {
  id: string;
  legacy_id: string | null;
  patient_name: string;
  patient_contact: string | null;
  tpa_name: string;
  insurance_company_name: string | null;
  claim_number: string;
  claim_status: string;
  claim_creation_date: string;
  outstanding_amount: number;
  is_irdai_breach: boolean;
}

export interface DbFollowUp {
  id: string;
  claim_id: string;
  outcome: string;
  ref_number: string | null;
  notes: string | null;
  promised_date: string | null;
  next_action_date: string;
  logged_by: string | null;
  logged_at: string;
}

export interface NewFollowUpInput {
  claim_id: string;
  outcome: string;
  ref_number?: string;
  notes?: string;
  promised_date?: string;
  next_action_date: string;
  logged_by?: string;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export interface ClaimWithMeta extends DbClaim {
  days_since_claim: number;
  latest_follow_up?: DbFollowUp;
}

export function useFollowUpData() {
  const [claims, setClaims] = useState<DbClaim[]>([]);
  const [followUps, setFollowUps] = useState<DbFollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [claimsRes, fuRes] = await Promise.all([
      supabase
        .from("claims")
        .select(
          "id, legacy_id, patient_name, patient_contact, tpa_name, insurance_company_name, claim_number, claim_status, claim_creation_date, outstanding_amount, is_irdai_breach"
        )
        .order("is_irdai_breach", { ascending: false })
        .order("outstanding_amount", { ascending: false }),
      supabase
        .from("follow_ups")
        .select("*")
        .order("logged_at", { ascending: false }),
    ]);
    if (claimsRes.error) setError(claimsRes.error.message);
    if (fuRes.error) setError(fuRes.error.message);
    setClaims((claimsRes.data ?? []) as DbClaim[]);
    setFollowUps((fuRes.data ?? []) as DbFollowUp[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("follow_ups_rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "follow_ups" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const enriched = useMemo<ClaimWithMeta[]>(() => {
    const latestByClaim = new Map<string, DbFollowUp>();
    // followUps already ordered by logged_at desc
    for (const fu of followUps) {
      if (!latestByClaim.has(fu.claim_id)) latestByClaim.set(fu.claim_id, fu);
    }
    return claims.map((c) => ({
      ...c,
      days_since_claim: daysSince(c.claim_creation_date),
      latest_follow_up: latestByClaim.get(c.id),
    }));
  }, [claims, followUps]);

  const logFollowUp = useCallback(async (input: NewFollowUpInput) => {
    const { getCurrentOrgId } = await import("@/lib/currentOrg");
    const { data, error } = await supabase
      .from("follow_ups")
      .insert({ ...input, org_id: getCurrentOrgId() })
      .select()
      .single();
    if (error) throw error;
    return data as DbFollowUp;
  }, []);

  const deleteFollowUp = useCallback(async (id: string) => {
    const { error } = await supabase.from("follow_ups").delete().eq("id", id);
    if (error) throw error;
  }, []);

  return { claims: enriched, followUps, loading, error, logFollowUp, deleteFollowUp, reload: load };
}
