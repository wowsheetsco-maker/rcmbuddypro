import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mockClaims, type Claim } from "@/data/mockClaims";

/** Days since a YYYY-MM-DD date string. */
function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/**
 * Maps a DB row from the `claims` table into the in-app `Claim` shape used
 * across the UI (which still carries the legacy `days_since_claim` field).
 */
export function rowToClaim(r: Record<string, unknown>): Claim {
  const claim_creation_date = (r.claim_creation_date as string) ?? "";
  return {
    id: String(r.id ?? ""),
    ihx_ref_id: (r.ihx_ref_id as string) ?? "",
    hospital_name: (r.hospital_name as string) ?? "",
    patient_name: (r.patient_name as string) ?? "",
    patient_contact: (r.patient_contact as string) ?? null,
    in_patient_number: (r.in_patient_number as string) ?? null,
    member_customer_id: (r.member_customer_id as string) ?? null,
    date_of_admission: (r.date_of_admission as string) ?? null,
    date_of_discharge: (r.date_of_discharge as string) ?? null,
    tpa_name: (r.tpa_name as string) ?? "",
    insurance_company_name: (r.insurance_company_name as string) ?? null,
    policy_number: (r.policy_number as string) ?? null,
    claim_number: (r.claim_number as string) ?? "",
    initial_claim_number: (r.initial_claim_number as string) ?? null,
    claim_creation_date,
    claimed_amount: Number(r.claimed_amount ?? 0),
    approved_amount: Number(r.approved_amount ?? 0),
    copay: Number(r.copay ?? 0),
    shortfall_amount: Number(r.shortfall_amount ?? 0),
    hospital_discount: Number(r.hospital_discount ?? 0),
    patient_paid_amount: Number(r.patient_paid_amount ?? 0),
    settled_amount: Number(r.settled_amount ?? 0),
    tds_amount: Number(r.tds_amount ?? 0),
    cheque_neft_utr_no: (r.cheque_neft_utr_no as string) ?? null,
    cheque_neft_utr_date: (r.cheque_neft_utr_date as string) ?? null,
    receipt_no: (r.receipt_no as string) ?? null,
    claim_status: (r.claim_status as string) ?? "",
    doc_submission_date: (r.doc_submission_date as string) ?? null,
    payment_update_date: (r.payment_update_date as string) ?? null,
    treatment: (r.treatment as string) ?? null,
    diagnosis: (r.diagnosis as string) ?? null,
    policy_type: (r.policy_type as string) ?? null,
    policy_holder_name: (r.policy_holder_name as string) ?? null,
    employee_code: (r.employee_code as string) ?? null,
    insurer_comments: (r.insurer_comments as string) ?? null,
    outstanding_amount: Number(r.outstanding_amount ?? 0),
    days_since_claim: daysSince(claim_creation_date),
    is_irdai_breach: Boolean(r.is_irdai_breach),
    tpa_spoc: (r.tpa_spoc as string) ?? null,
    hospital_spoc: (r.hospital_spoc as string) ?? null,
    last_communication_at: (r.last_communication_at as string) ?? null,
    last_communication_note: (r.last_communication_note as string) ?? null,
    remarks: (r.remarks as string) ?? null,
    action_plan: (r.action_plan as string) ?? null,
    data_quality: (r.data_quality as Claim["data_quality"]) ?? null,
    hospital_group_id: (r.hospital_group_id as string) ?? null,
    hospital_branch_id: (r.hospital_branch_id as string) ?? null,
  };
}

export interface UseLiveClaimsResult {
  claims: Claim[];
  loading: boolean;
  isMock: boolean;
  refetch: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Module-level shared cache + pub/sub so every page gets the same fresh data
// and re-renders the moment claims change (import, edit, realtime event).
// ---------------------------------------------------------------------------
let cachedClaims: Claim[] | null = null;
let cachedIsMock = false;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();
let realtimeBound = false;
const STORAGE_BUMP_KEY = "rcm-buddy-claims-bump";

function notifySubscribers() {
  for (const cb of subscribers) cb();
}

/** Public helper — call after any write to claims to refresh every consumer. */
export function bumpClaimsVersion() {
  cachedClaims = null; // force the next fetch to hit the DB
  // Cross-tab signal
  try {
    localStorage.setItem(STORAGE_BUMP_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  void fetchClaimsShared().then(notifySubscribers);
}

async function fetchClaimsShared(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const pageSize = 1000;
    let from = 0;
    const all: Claim[] = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .range(from, from + pageSize - 1);
      if (error || !data) break;
      all.push(...data.map(rowToClaim));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    // Only fall back to mock data on the very first load when the user has
    // never had real data. If the user has explicitly cleared their claims
    // (flag set by DataManagementPage), respect that and show an empty list.
    const cleared = typeof localStorage !== "undefined"
      && localStorage.getItem("rcm-buddy-claims-cleared") === "1";
    if (all.length === 0 && !cleared) {
      cachedClaims = mockClaims;
      cachedIsMock = true;
    } else {
      cachedClaims = all;
      cachedIsMock = false;
    }
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

function ensureRealtimeBinding() {
  if (realtimeBound) return;
  realtimeBound = true;

  // Live DB changes → invalidate + refetch
  supabase
    .channel("claims-live-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "claims" },
      () => {
        cachedClaims = null;
        void fetchClaimsShared().then(notifySubscribers);
      },
    )
    .subscribe();

  // Cross-tab changes (e.g. import in another tab)
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_BUMP_KEY) {
        cachedClaims = null;
        void fetchClaimsShared().then(notifySubscribers);
      }
    });
    // When the tab regains focus, do a quick refresh — cheap safety net
    window.addEventListener("focus", () => {
      void fetchClaimsShared().then(notifySubscribers);
    });
  }
}

/**
 * Fetches every claim in the database (paginated to bypass the 1000-row
 * default limit). Shared across all consumers so a single fetch hydrates
 * every page, and any write/realtime event refreshes every consumer.
 */
export function useLiveClaims(): UseLiveClaimsResult {
  const [, force] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    ensureRealtimeBinding();

    const cb = () => {
      if (mounted.current) force((n) => n + 1);
    };
    subscribers.add(cb);

    // Kick off initial fetch if we don't have data yet
    if (cachedClaims === null) {
      void fetchClaimsShared().then(notifySubscribers);
    }

    return () => {
      mounted.current = false;
      subscribers.delete(cb);
    };
  }, []);

  const refetch = useCallback(async () => {
    cachedClaims = null;
    await fetchClaimsShared();
    notifySubscribers();
  }, []);

  return {
    claims: cachedClaims ?? [],
    loading: cachedClaims === null,
    isMock: cachedIsMock,
    refetch,
  };
}
