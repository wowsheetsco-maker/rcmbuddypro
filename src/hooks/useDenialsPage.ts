import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Claim } from "@/data/mockClaims";

export interface DenialsQueryParams {
  search?: string;
  sort?: "age" | "shortPaid";
  dir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
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

/** Same regex as denialAnalytics.isDeniedStatus — denied/query/rejected. */
const DENIAL_FILTER =
  "claim_status.ilike.%deni%,claim_status.ilike.%query%,claim_status.ilike.%reject%";

export interface DenialPageRow {
  claim: Claim;
  shortPaid: number;
}

export interface UseDenialsPageResult {
  rows: DenialPageRow[];
  totalCount: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDenialsPage(params: DenialsQueryParams): UseDenialsPageResult {
  const { search = "", sort = "shortPaid", dir = "desc", page, pageSize } = params;
  const [rows, setRows] = useState<DenialPageRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true); setError(null);
    try {
      let q = supabase
        .from("claims")
        .select("*", { count: "exact" })
        .or(DENIAL_FILTER);
      const term = search.trim();
      if (term) {
        const safe = escapeLike(term);
        q = q.or(`claim_number.ilike.%${safe}%,patient_name.ilike.%${safe}%,tpa_name.ilike.%${safe}%`);
      }
      // age maps to claim_creation_date (asc date = older = higher age).
      // We want UI dir to mean dir-of-age, so flip when sorting by age.
      const sortCol = sort === "age" ? "claim_creation_date" : "shortfall_amount";
      const ascending = sort === "age" ? dir === "desc" : dir === "asc";
      q = q.order(sortCol, { ascending });
      const from = page * pageSize;
      q = q.range(from, from + pageSize - 1);
      const { data, count, error: err } = await q;
      if (reqId !== reqIdRef.current) return;
      if (err) { setError(err.message); setRows([]); setTotalCount(0); return; }
      const mapped: DenialPageRow[] = (data ?? []).map((r: Record<string, unknown>) => {
        const claim = rowToClaim(r);
        const shortPaid = claim.approved_amount > 0
          ? Math.max(claim.claimed_amount - claim.approved_amount, claim.outstanding_amount)
          : claim.claimed_amount;
        return { claim, shortPaid };
      });
      setRows(mapped);
      setTotalCount(count ?? 0);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [search, sort, dir, page, pageSize]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);

  useEffect(() => {
    const ch = supabase
      .channel(`denials-page-${page}-${pageSize}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, () => void fetchPage())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [fetchPage, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)));
  return { rows, totalCount, totalPages, loading, error, refetch: fetchPage };
}
