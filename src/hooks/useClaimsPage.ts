import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Claim } from "@/data/mockClaims";

export interface ClaimsQueryParams {
  search?: string;
  /** Search a specific column instead of OR across name/number/tpa. */
  searchField?: "all" | "claim_number" | "patient_name" | "tpa_name";
  /** Substring match against claim_status (case-insensitive). "" or "all" disables. */
  statusFilter?: string;
  /** When true, only rows with is_irdai_breach = true. */
  breachOnly?: boolean;
  /** Exact match on tpa_name OR insurance_company_name. "" or "all" disables. */
  insurerFilter?: string;
  /** Column to order by — must be a real column on claims. */
  sort?: string;
  dir?: "asc" | "desc";
  page: number;     // zero-indexed
  pageSize: number;
  branchId?: string;
}

export interface UseClaimsPageResult {
  claims: Claim[];
  totalCount: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function rowToClaim(r: Record<string, unknown>): Claim {
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

/** Escape `%` and `_` for ilike, and wrap so callers can pass raw text. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Server-side paginated claims fetcher. Use this for big table views where
 * loading the full claim set into memory would be too expensive. For
 * KPI/aggregate widgets that need every row, keep using `useLiveClaims`.
 */
export function useClaimsPage(params: ClaimsQueryParams): UseClaimsPageResult {
  const {
    search = "",
    searchField = "all",
    statusFilter = "all",
    breachOnly = false,
    insurerFilter = "all",
    sort = "claim_creation_date",
    dir = "desc",
    page,
    pageSize,
    branchId,
  } = params;

  const [claims, setClaims] = useState<Claim[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("claims")
        .select("*", { count: "exact" });

      if (statusFilter && statusFilter !== "all") {
        q = q.ilike("claim_status", `%${escapeLike(statusFilter)}%`);
      }
      if (breachOnly) q = q.eq("is_irdai_breach", true);
      if (branchId) q = q.eq("hospital_branch_id", branchId);
      if (insurerFilter && insurerFilter !== "all") {
        const safeI = escapeLike(insurerFilter);
        q = q.or(`tpa_name.ilike.${safeI},insurance_company_name.ilike.${safeI}`);
      }



      const term = search.trim();
      if (term) {
        const safe = escapeLike(term);
        if (searchField === "claim_number") q = q.ilike("claim_number", `%${safe}%`);
        else if (searchField === "patient_name") q = q.ilike("patient_name", `%${safe}%`);
        else if (searchField === "tpa_name") q = q.ilike("tpa_name", `%${safe}%`);
        else {
          q = q.or(
            `claim_number.ilike.%${safe}%,patient_name.ilike.%${safe}%,tpa_name.ilike.%${safe}%`,
          );
        }
      }

      q = q.order(sort, { ascending: dir === "asc" });
      const from = page * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data, count, error: err } = await q;
      if (reqId !== reqIdRef.current) return; // stale
      if (err) {
        setError(err.message);
        setClaims([]);
        setTotalCount(0);
        return;
      }
      setClaims((data ?? []).map(rowToClaim));
      setTotalCount(count ?? 0);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [search, searchField, statusFilter, breachOnly, insurerFilter, sort, dir, page, pageSize, branchId]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  // Realtime: invalidate current page on any change to claims. Cheap because
  // it only refetches one page worth of rows.
  useEffect(() => {
    const ch = supabase
      .channel(`claims-page-${page}-${pageSize}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "claims" },
        () => void fetchPage(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [fetchPage, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)));
  return { claims, totalCount, totalPages, loading, error, refetch: fetchPage };
}
