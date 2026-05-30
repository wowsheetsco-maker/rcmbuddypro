import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FollowupPriority = "high" | "medium" | "low";

export interface FollowupGroupRow {
  tpa: string;
  claim_count: number;
  total_outstanding: number;
  oldest_days: number;
  breach_count: number;
  priority: FollowupPriority;
}

export interface FollowupGroupsParams {
  priority?: FollowupPriority | "all";
  search?: string;
  sort?: "outstanding" | "oldest" | "claims";
  dir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface FollowupKpis {
  overdue: number;
  dueToday: number;
  upcoming: number;
  totalGroups: number;
}

const SORT_COLS: Record<NonNullable<FollowupGroupsParams["sort"]>, string> = {
  outstanding: "total_outstanding",
  oldest: "oldest_days",
  claims: "claim_count",
};

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export interface UseFollowupGroupsPageResult {
  rows: FollowupGroupRow[];
  totalCount: number;
  totalPages: number;
  kpis: FollowupKpis;
  loading: boolean;
  kpisLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useFollowupGroupsPage(params: FollowupGroupsParams): UseFollowupGroupsPageResult {
  const { priority = "all", search = "", sort = "outstanding", dir = "desc", page, pageSize } = params;
  const [rows, setRows] = useState<FollowupGroupRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [kpis, setKpis] = useState<FollowupKpis>({ overdue: 0, dueToday: 0, upcoming: 0, totalGroups: 0 });
  const [loading, setLoading] = useState(true);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const fetchPage = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true); setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase as any).from("v_followup_tpa_groups").select("*", { count: "exact" });
      if (priority !== "all") q = q.eq("priority", priority);
      const term = search.trim();
      if (term) q = q.ilike("tpa", `%${escapeLike(term)}%`);
      q = q.order(SORT_COLS[sort], { ascending: dir === "asc" });
      const from = page * pageSize;
      q = q.range(from, from + pageSize - 1);
      const { data, count, error: err } = await q;
      if (reqId !== reqIdRef.current) return;
      if (err) { setError(err.message); setRows([]); setTotalCount(0); return; }
      setRows((data ?? []).map((r: Record<string, unknown>) => ({
        tpa: String(r.tpa ?? ""),
        claim_count: Number(r.claim_count ?? 0),
        total_outstanding: Number(r.total_outstanding ?? 0),
        oldest_days: Number(r.oldest_days ?? 0),
        breach_count: Number(r.breach_count ?? 0),
        priority: (r.priority as FollowupPriority) ?? "low",
      })));
      setTotalCount(count ?? 0);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [priority, search, sort, dir, page, pageSize]);

  const fetchKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("v_followup_tpa_groups").select("oldest_days,breach_count").limit(10000);
      const out: FollowupKpis = { overdue: 0, dueToday: 0, upcoming: 0, totalGroups: 0 };
      for (const r of (data ?? []) as Array<{ oldest_days: number; breach_count: number }>) {
        out.totalGroups += 1;
        const days = Number(r.oldest_days ?? 0);
        if (Number(r.breach_count ?? 0) > 0 || days > 30) out.overdue += 1;
        if (days >= 7 && days <= 15) out.dueToday += 1;
        if (days > 0 && days < 7) out.upcoming += 1;
      }
      setKpis(out);
    } finally {
      setKpisLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPage(); }, [fetchPage]);
  useEffect(() => { void fetchKpis(); }, [fetchKpis]);

  useEffect(() => {
    const ch = supabase
      .channel(`followup-groups-${page}-${pageSize}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, () => {
        void fetchPage(); void fetchKpis();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [fetchPage, fetchKpis, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)));
  return { rows, totalCount, totalPages, kpis, loading, kpisLoading, error, refetch: fetchPage };
}
