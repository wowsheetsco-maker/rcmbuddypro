import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Claim } from "@/data/mockClaims";

export type PriorityBand = "critical" | "high" | "medium" | "low";

export interface PriorityRow {
  claim: Claim;
  score: number;
  band: PriorityBand;
}

export interface PriorityQueryParams {
  band?: PriorityBand | "all";
  search?: string;
  sort?: "score" | "outstanding" | "age";
  dir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface PriorityBandCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  totalOutstanding: number;
  slaBreaches: number;
  totalRows: number;
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

const SORT_COLS: Record<NonNullable<PriorityQueryParams["sort"]>, string> = {
  score: "priority_score",
  outstanding: "outstanding_amount",
  age: "age_days",
};

export interface UsePriorityWorklistPageResult {
  rows: PriorityRow[];
  totalCount: number;
  totalPages: number;
  counts: PriorityBandCounts;
  loading: boolean;
  countsLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePriorityWorklistPage(params: PriorityQueryParams): UsePriorityWorklistPageResult {
  const { band = "all", search = "", sort = "score", dir = "desc", page, pageSize } = params;

  const [rows, setRows] = useState<PriorityRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [counts, setCounts] = useState<PriorityBandCounts>({
    critical: 0, high: 0, medium: 0, low: 0, totalOutstanding: 0, slaBreaches: 0, totalRows: 0,
  });
  const [loading, setLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase as any).from("v_claims_priority").select("*", { count: "exact" });
      // Denied claims (claim / enhancement / pre-auth denied) live only on
      // the Denials page — never on the Priority Worklist.
      q = q.not("claim_status", "ilike", "%deni%")
           .not("claim_status", "ilike", "%reject%")
           .not("claim_status", "ilike", "%repudiat%");
      if (band !== "all") q = q.eq("priority_band", band);
      const term = search.trim();
      if (term) {
        const safe = escapeLike(term);
        q = q.or(`claim_number.ilike.%${safe}%,patient_name.ilike.%${safe}%,tpa_name.ilike.%${safe}%`);
      }
      q = q.order(SORT_COLS[sort], { ascending: dir === "asc" });
      const from = page * pageSize;
      q = q.range(from, from + pageSize - 1);
      const { data, count, error: err } = await q;
      if (reqId !== reqIdRef.current) return;
      if (err) { setError(err.message); setRows([]); setTotalCount(0); return; }
      const mapped: PriorityRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
        claim: rowToClaim(r),
        score: Number(r.priority_score ?? 0),
        band: (r.priority_band as PriorityBand) ?? "low",
      }));
      setRows(mapped);
      setTotalCount(count ?? 0);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [band, search, sort, dir, page, pageSize]);

  const fetchCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase as any).from("v_claims_priority").select("priority_band,outstanding_amount,is_irdai_breach");
      q = q.not("claim_status", "ilike", "%deni%")
           .not("claim_status", "ilike", "%reject%")
           .not("claim_status", "ilike", "%repudiat%");
      const term = search.trim();
      if (term) {
        const safe = escapeLike(term);
        q = q.or(`claim_number.ilike.%${safe}%,patient_name.ilike.%${safe}%,tpa_name.ilike.%${safe}%`);
      }
      const { data } = await q.limit(10000);
      const out: PriorityBandCounts = {
        critical: 0, high: 0, medium: 0, low: 0, totalOutstanding: 0, slaBreaches: 0, totalRows: 0,
      };
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        const b = (r.priority_band as PriorityBand) ?? "low";
        out[b] += 1;
        out.totalRows += 1;
        out.totalOutstanding += Number(r.outstanding_amount ?? 0);
        if (r.is_irdai_breach) out.slaBreaches += 1;
      }
      setCounts(out);
    } finally {
      setCountsLoading(false);
    }
  }, [search]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);
  useEffect(() => { void fetchCounts(); }, [fetchCounts]);

  useEffect(() => {
    const ch = supabase
      .channel(`priority-worklist-${page}-${pageSize}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, () => {
        void fetchPage();
        void fetchCounts();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [fetchPage, fetchCounts, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)));
  return { rows, totalCount, totalPages, counts, loading, countsLoading, error, refetch: fetchPage };
}
