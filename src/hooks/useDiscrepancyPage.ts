import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Claim } from "@/data/mockClaims";
import type { DiscrepancyBand, DiscrepancyMetrics } from "@/lib/discrepancy";

export type DiscrepancyStage = "discrepancy" | "appeal";

export interface DiscrepancyQueryParams {
  stage: DiscrepancyStage;
  band?: DiscrepancyBand | "all";
  tpa?: string;
  search?: string;
  sort?: "amount" | "approved" | "settled" | "pct";
  dir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface DiscrepancyPageRow {
  claim: Claim;
  metrics: DiscrepancyMetrics;
  action?: {
    stage: string;
    status: string;
    last_action_type: string | null;
    last_action_at: string | null;
    email_sent_count: number;
    pushed_to_appeal_at: string | null;
  };
}

export interface DiscrepancyCounts {
  discrepancyCount: number;
  appealCount: number;
  totalAmount: number;
  high: number;
  visible: number;
}

const SORT_COLS: Record<NonNullable<DiscrepancyQueryParams["sort"]>, { col: string; calc?: (a: number, b: number) => number }> = {
  amount: { col: "disc_amount" },
  approved: { col: "approved_amount" },
  settled: { col: "settled_amount" }, // approx — true Settled+TDS not indexable, view sorts on settled only
  pct: { col: "disc_pct" },
};

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** Build a partial Claim from the view row (view only exposes a subset). */
function rowToClaim(r: Record<string, unknown>): Claim {
  const claim_creation_date = (r.claim_creation_date as string) ?? "";
  return {
    id: String(r.claim_id ?? ""),
    ihx_ref_id: "",
    hospital_name: (r.hospital_name as string) ?? "",
    patient_name: (r.patient_name as string) ?? "",
    patient_contact: null,
    in_patient_number: null,
    member_customer_id: null,
    date_of_admission: null,
    date_of_discharge: null,
    tpa_name: (r.tpa_name as string) ?? "",
    insurance_company_name: (r.insurance_company_name as string) ?? null,
    policy_number: null,
    claim_number: (r.claim_number as string) ?? "",
    initial_claim_number: null,
    claim_creation_date,
    claimed_amount: 0,
    approved_amount: Number(r.approved_amount ?? 0),
    copay: 0,
    shortfall_amount: 0,
    hospital_discount: 0,
    patient_paid_amount: 0,
    settled_amount: Number(r.settled_amount ?? 0),
    tds_amount: Number(r.tds_amount ?? 0),
    cheque_neft_utr_no: null,
    cheque_neft_utr_date: null,
    receipt_no: null,
    claim_status: (r.claim_status as string) ?? "",
    doc_submission_date: null,
    payment_update_date: null,
    treatment: null,
    diagnosis: null,
    policy_type: null,
    policy_holder_name: null,
    employee_code: null,
    insurer_comments: null,
    outstanding_amount: Number(r.outstanding_amount ?? 0),
    days_since_claim: daysSince(claim_creation_date),
    is_irdai_breach: Boolean(r.is_irdai_breach),
    tpa_spoc: null,
    hospital_spoc: null,
    last_communication_at: null,
    last_communication_note: null,
    remarks: null,
    action_plan: null,
    data_quality: null,
    hospital_group_id: null,
    hospital_branch_id: null,
  };
}

export interface UseDiscrepancyPageResult {
  rows: DiscrepancyPageRow[];
  totalCount: number;
  totalPages: number;
  counts: DiscrepancyCounts;
  tpaList: string[];
  loading: boolean;
  countsLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDiscrepancyPage(params: DiscrepancyQueryParams): UseDiscrepancyPageResult {
  const { stage, band = "all", tpa, search = "", sort = "amount", dir = "desc", page, pageSize } = params;
  const [rows, setRows] = useState<DiscrepancyPageRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [counts, setCounts] = useState<DiscrepancyCounts>({
    discrepancyCount: 0, appealCount: 0, totalAmount: 0, high: 0, visible: 0,
  });
  const [tpaList, setTpaList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [countsLoading, setCountsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const applyFilters = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q: any) => {
      q = q.eq("stage", stage);
      if (band !== "all") q = q.eq("band", band);
      if (tpa && tpa !== "all") q = q.eq("tpa_name", tpa);
      const term = search.trim();
      if (term) {
        const safe = escapeLike(term);
        q = q.or(`claim_number.ilike.%${safe}%,patient_name.ilike.%${safe}%,tpa_name.ilike.%${safe}%`);
      }
      return q;
    },
    [stage, band, tpa, search],
  );

  const fetchPage = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true); setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase as any).from("v_discrepancy_rows").select("*", { count: "exact" });
      q = applyFilters(q);
      q = q.order(SORT_COLS[sort].col, { ascending: dir === "asc" });
      const from = page * pageSize;
      q = q.range(from, from + pageSize - 1);
      const { data, count, error: err } = await q;
      if (reqId !== reqIdRef.current) return;
      if (err) { setError(err.message); setRows([]); setTotalCount(0); return; }
      const mapped: DiscrepancyPageRow[] = (data ?? []).map((r: Record<string, unknown>) => {
        const claim = rowToClaim(r);
        const metrics: DiscrepancyMetrics = {
          isDiscrepant: true,
          amount: Number(r.disc_amount ?? 0),
          pct: Number(r.disc_pct ?? 0),
          band: (r.band as DiscrepancyBand) ?? "low",
          isClosed: true,
        };
        const action = r.last_action_type || r.action_status || r.stage
          ? {
              stage: String(r.stage ?? "discrepancy"),
              status: String(r.action_status ?? ""),
              last_action_type: (r.last_action_type as string) ?? null,
              last_action_at: (r.last_action_at as string) ?? null,
              email_sent_count: Number(r.email_sent_count ?? 0),
              pushed_to_appeal_at: (r.pushed_to_appeal_at as string) ?? null,
            }
          : undefined;
        return { claim, metrics, action };
      });
      setRows(mapped);
      setTotalCount(count ?? 0);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [applyFilters, sort, dir, page, pageSize]);

  const fetchCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("v_discrepancy_rows")
        .select("stage,band,disc_amount,tpa_name")
        .limit(10000);
      const out: DiscrepancyCounts = { discrepancyCount: 0, appealCount: 0, totalAmount: 0, high: 0, visible: 0 };
      const tpas = new Set<string>();
      for (const r of (data ?? []) as Array<{ stage: string; band: string; disc_amount: number; tpa_name: string }>) {
        if (r.stage === "appeal") out.appealCount += 1;
        else out.discrepancyCount += 1;
        if (r.stage === stage) {
          out.visible += 1;
          out.totalAmount += Number(r.disc_amount ?? 0);
          if (r.band === "high") out.high += 1;
        }
        if (r.tpa_name) tpas.add(r.tpa_name);
      }
      setCounts(out);
      setTpaList(Array.from(tpas).sort());
    } finally {
      setCountsLoading(false);
    }
  }, [stage]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);
  useEffect(() => { void fetchCounts(); }, [fetchCounts]);

  useEffect(() => {
    const ch = supabase
      .channel(`discrepancy-page-${page}-${pageSize}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, () => { void fetchPage(); void fetchCounts(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "discrepancy_actions" }, () => { void fetchPage(); void fetchCounts(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [fetchPage, fetchCounts, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)));
  return { rows, totalCount, totalPages, counts, tpaList, loading, countsLoading, error, refetch: fetchPage };
}
