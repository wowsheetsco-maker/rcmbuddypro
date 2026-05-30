import React, { useEffect, useMemo, useState, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard as SharedKpiCard } from "@/components/ui/kpi-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Cell,
} from "recharts";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useAppUsers } from "@/hooks/useAppUsers";
import { useUserAllocations } from "@/hooks/useUserAllocations";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { SETTLED_STATUSES, DENIED_STATUSES } from "@/lib/payerScorecard";
import { toast } from "sonner";
import {
  Pencil, Trophy, Download, FileDown, Settings2, AlertTriangle,
  TrendingUp, Users, IndianRupee, Clock, ShieldCheck, XCircle, ChevronDown,
  BarChart2, RotateCcw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Claim } from "@/data/mockClaims";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Override {
  id?: string;
  app_user_id: string;
  month: string;
  query_resolved: number;
  rating_override: string | null;
  notes: string | null;
}

interface KpiConfig {
  approvalTarget: number;   // %
  denialMax: number;        // %
  tatTargetDays: number;    // days
  slaTargetDays: number;    // days from creation to settlement
  collectionTarget: number; // %
  lowPerformerScore: number;
}

const DEFAULT_KPIS: KpiConfig = {
  approvalTarget: 92,
  denialMax: 5,
  tatTargetDays: 30,
  slaTargetDays: 30,
  collectionTarget: 95,
  lowPerformerScore: 55,
};

const KPI_STORAGE = "staff-scorecard-kpis";
function loadKpiConfig(): KpiConfig {
  if (typeof window === "undefined") return DEFAULT_KPIS;
  try {
    const raw = localStorage.getItem(KPI_STORAGE);
    if (!raw) return DEFAULT_KPIS;
    return { ...DEFAULT_KPIS, ...JSON.parse(raw) };
  } catch { return DEFAULT_KPIS; }
}

interface StaffMetric {
  userId: string;
  name: string;
  role: string;
  providers: string[];
  claimsHandled: number;
  claimsCollected: number;
  collectionAmt: number;
  rejectionCount: number;
  rejectionPct: number;
  approvalPct: number;
  slaCompliancePct: number;
  avgTat: number;
  queryResolved: number;
  revenuePerEmp: number;
  score: number;
  rating: { label: string; tone: string };
  notes: string;
  slaRisk: "ok" | "warn" | "risk";
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
};
const inMonth = (d: string | null | undefined, key: string) => !!d && d.slice(0, 7) === key;
const inYear = (d: string | null | undefined, year: string) => !!d && d.slice(0, 4) === year;
const quarterOf = (d: Date) => Math.floor(d.getMonth() / 3) + 1;
const inQuarter = (d: string | null | undefined, year: string, q: number) => {
  if (!d) return false;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return false;
  return String(dt.getFullYear()) === year && quarterOf(dt) === q;
};
const quarterMonths = (year: string, q: number): string[] => {
  const startMonth = (q - 1) * 3;
  return [0, 1, 2].map((i) => `${year}-${String(startMonth + i + 1).padStart(2, "0")}`);
};
const quarterLabel = (year: string, q: number) => `Q${q} ${year} (${MONTHS[(q - 1) * 3]}–${MONTHS[(q - 1) * 3 + 2]})`;

function ratingFor(score: number): { label: string; tone: string } {
  if (score >= 85) return { label: "🟢 Excellent", tone: "bg-success/15 text-success border-success/40" };
  if (score >= 70) return { label: "🟢 Good", tone: "bg-success/10 text-success border-success/30" };
  if (score >= 55) return { label: "🟡 Average", tone: "bg-warning/15 text-warning border-warning/40" };
  if (score >= 40) return { label: "🟠 Below Avg", tone: "bg-orange-500/15 text-orange-600 border-orange-500/40" };
  return { label: "🔴 Needs Improvement", tone: "bg-destructive/15 text-destructive border-destructive/40" };
}

function scoreFor(p: {
  claimsHandled: number;
  rejectionPct: number;
  avgTat: number;
  collectionRatio: number;
  queryResolved: number;
  slaCompliancePct: number;
  kpi: KpiConfig;
}): number {
  const volScore = Math.min(100, (Math.log1p(p.claimsHandled) / Math.log1p(100)) * 100);
  const collScore = Math.min(100, p.collectionRatio * 100);
  // Rejection vs target
  const rejScore = Math.max(0, 100 - (p.rejectionPct / Math.max(1, p.kpi.denialMax)) * 50);
  // TAT vs target
  const tatScore = p.avgTat <= 0 ? 50 : Math.max(0, 100 - ((p.avgTat - p.kpi.tatTargetDays / 2) / p.kpi.tatTargetDays) * 100);
  const qScore = Math.min(100, (p.queryResolved / 50) * 100);
  const slaScore = p.slaCompliancePct;
  return Math.round(
    volScore * 0.15 +
    collScore * 0.25 +
    rejScore * 0.20 +
    tatScore * 0.15 +
    slaScore * 0.15 +
    qScore * 0.10,
  );
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
  providers: string[];
}

function buildStaffMetric(
  member: StaffMember,
  claims: Claim[],
  override: Override | undefined,
  filter: (c: Claim) => boolean,
  kpi: KpiConfig,
): StaffMetric {
  const nameKey = (member.name || "").toLowerCase().trim();
  const own = nameKey
    ? claims.filter((c) => (c.hospital_spoc || "").toLowerCase().trim() === nameKey)
    : [];
  const handled = own.filter(filter);
  const settled = handled.filter((c) => SETTLED_STATUSES.has((c.claim_status || "").toLowerCase().trim()));
  const denied = handled.filter((c) => DENIED_STATUSES.has((c.claim_status || "").toLowerCase().trim()));
  const approved = handled.filter((c) =>
    SETTLED_STATUSES.has((c.claim_status || "").toLowerCase().trim()) ||
    (c.approved_amount || 0) > 0,
  );
  const collectionAmt = settled.reduce((s, c) => s + (c.settled_amount || 0), 0);

  let tatTotal = 0, tatCount = 0, slaOk = 0, slaTotal = 0;
  for (const c of settled) {
    if (c.payment_update_date && c.claim_creation_date) {
      const start = new Date(c.claim_creation_date).getTime();
      const end = new Date(c.payment_update_date).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
        const days = Math.floor((end - start) / 86_400_000);
        if (days <= 365) {
          tatTotal += days; tatCount += 1;
          slaTotal += 1;
          if (days <= kpi.slaTargetDays) slaOk += 1;
        }
      }
    }
  }
  const avgTat = tatCount ? Math.round(tatTotal / tatCount) : 0;
  const rejectionPct = handled.length ? +((denied.length / handled.length) * 100).toFixed(1) : 0;
  const approvalPct = handled.length ? +((approved.length / handled.length) * 100).toFixed(1) : 0;
  const slaCompliancePct = slaTotal ? +((slaOk / slaTotal) * 100).toFixed(1) : 0;
  const collectionRatio = handled.length ? settled.length / handled.length : 0;
  const queryResolved = override?.query_resolved ?? 0;
  const score = scoreFor({
    claimsHandled: handled.length,
    rejectionPct, avgTat, collectionRatio, queryResolved, slaCompliancePct, kpi,
  });
  const slaRisk: "ok" | "warn" | "risk" =
    slaCompliancePct >= 90 ? "ok" : slaCompliancePct >= 70 ? "warn" : slaTotal === 0 ? "warn" : "risk";

  return {
    userId: member.id,
    name: member.name,
    role: member.role,
    providers: member.providers,
    claimsHandled: handled.length,
    claimsCollected: settled.length,
    collectionAmt,
    rejectionCount: denied.length,
    rejectionPct,
    approvalPct,
    slaCompliancePct,
    avgTat,
    queryResolved,
    revenuePerEmp: collectionAmt,
    score,
    rating: override?.rating_override
      ? { label: override.rating_override, tone: "bg-secondary/30 text-foreground border-border" }
      : ratingFor(score),
    notes: override?.notes ?? "",
    slaRisk,
  };
}

function fmtINR(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function StaffScorecardPage() {
  const { claims, loading } = useLiveClaims();
  const { users } = useAppUsers();
  const { allAllocations } = useUserAllocations(null);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [editing, setEditing] = useState<{ userId: string; userName: string } | null>(null);
  const [kpiConfig, setKpiConfig] = useState<KpiConfig>(loadKpiConfig);
  const [kpiDialog, setKpiDialog] = useState(false);
  const [showLowOnly, setShowLowOnly] = useState(false);

  const now = new Date();
  const MONTH_STORAGE_KEY = "staff-scorecard-month";
  const YEAR_STORAGE_KEY = "staff-scorecard-year";
  const [month, setMonthState] = useState(() => {
    if (typeof window === "undefined") return monthKey(now);
    return localStorage.getItem(MONTH_STORAGE_KEY) || monthKey(now);
  });
  const [year, setYearState] = useState(() => {
    if (typeof window === "undefined") return String(now.getFullYear());
    return localStorage.getItem(YEAR_STORAGE_KEY) || String(now.getFullYear());
  });
  const setMonth = (v: string) => { setMonthState(v); try { localStorage.setItem(MONTH_STORAGE_KEY, v); } catch { /* noop */ } };
  const setYear = (v: string) => { setYearState(v); try { localStorage.setItem(YEAR_STORAGE_KEY, v); } catch { /* noop */ } };
  const saveKpiConfig = (cfg: KpiConfig) => {
    setKpiConfig(cfg);
    try { localStorage.setItem(KPI_STORAGE, JSON.stringify(cfg)); } catch { /* noop */ }
    toast.success("KPI targets saved");
  };

  const loadOverrides = useCallback(async () => {
    const { data } = await supabase.from("staff_scorecard_overrides").select("*");
    setOverrides((data ?? []) as Override[]);
  }, []);

  const saveOverride = useCallback(async (
    userId: string, mKey: string,
    patch: Partial<Pick<Override, "query_resolved" | "rating_override" | "notes">>,
  ) => {
    const existing = overrides.find((o) => o.app_user_id === userId && o.month === mKey);
    const merged: Override = {
      id: existing?.id, app_user_id: userId, month: mKey,
      query_resolved: patch.query_resolved ?? existing?.query_resolved ?? 0,
      rating_override: patch.rating_override !== undefined ? patch.rating_override : (existing?.rating_override ?? null),
      notes: patch.notes !== undefined ? patch.notes : (existing?.notes ?? null),
    };
    const prev = overrides;
    setOverrides((cur) => {
      const idx = cur.findIndex((o) => o.app_user_id === userId && o.month === mKey);
      if (idx === -1) return [...cur, merged];
      const next = [...cur]; next[idx] = { ...next[idx], ...merged }; return next;
    });
    const { error } = await supabase.from("staff_scorecard_overrides").upsert({
      org_id: getCurrentOrgId(), app_user_id: userId, month: mKey,
      query_resolved: merged.query_resolved, rating_override: merged.rating_override, notes: merged.notes,
    }, { onConflict: "org_id,app_user_id,month" });
    if (error) { setOverrides(prev); toast.error(`Save failed: ${error.message}`); return false; }
    toast.success("Saved"); return true;
  }, [overrides]);

  useEffect(() => {
    void loadOverrides();
    const ch = supabase
      .channel(`staff-overrides-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_scorecard_overrides" }, () => loadOverrides())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadOverrides]);

  const BILLING_ROLES = useMemo(() => new Set(["Billing Executive", "RCM Manager"]), []);
  const staff: StaffMember[] = useMemo(() => {
    const billingUsers = users.filter((u) => u.status === "active" && BILLING_ROLES.has(u.role));
    return billingUsers.map((u) => ({
      id: u.id, name: u.name, role: u.role,
      providers: allAllocations.filter((a) => a.user_id === u.id).map((a) => a.provider),
    }));
  }, [users, allAllocations, BILLING_ROLES]);

  const overrideFor = useCallback(
    (userId: string, mKey: string) => overrides.find((o) => o.app_user_id === userId && o.month === mKey),
    [overrides],
  );

  const monthlyMetrics: StaffMetric[] = useMemo(() => {
    const all = staff
      .map((m) => buildStaffMetric(m, claims, overrideFor(m.id, month), (c) => inMonth(c.claim_creation_date, month), kpiConfig))
      .sort((a, b) => b.score - a.score);
    return showLowOnly ? all.filter((m) => m.score < kpiConfig.lowPerformerScore) : all;
  }, [staff, claims, overrideFor, month, kpiConfig, showLowOnly]);

  const yearlyMetrics: StaffMetric[] = useMemo(() => {
    return staff.map((m) => {
      const yo = overrides.filter((o) => o.app_user_id === m.id && o.month.startsWith(year));
      const totalQueries = yo.reduce((s, o) => s + (o.query_resolved || 0), 0);
      const lastNote = yo.sort((a, b) => b.month.localeCompare(a.month))[0]?.notes ?? "";
      const merged: Override = { app_user_id: m.id, month: year, query_resolved: totalQueries, rating_override: null, notes: lastNote };
      return buildStaffMetric(m, claims, merged, (c) => inYear(c.claim_creation_date, year), kpiConfig);
    }).sort((a, b) => b.score - a.score);
  }, [staff, claims, overrides, year, kpiConfig]);

  // Org KPI totals (selected month)
  const orgKpi = useMemo(() => {
    const handled = monthlyMetrics.reduce((s, m) => s + m.claimsHandled, 0);
    const collected = monthlyMetrics.reduce((s, m) => s + m.claimsCollected, 0);
    const collectionAmt = monthlyMetrics.reduce((s, m) => s + m.collectionAmt, 0);
    const rejected = monthlyMetrics.reduce((s, m) => s + m.rejectionCount, 0);
    const tatList = monthlyMetrics.filter((m) => m.avgTat > 0);
    const avgTat = tatList.length ? Math.round(tatList.reduce((s, m) => s + m.avgTat, 0) / tatList.length) : 0;
    const slaList = monthlyMetrics.filter((m) => m.slaCompliancePct > 0 || m.claimsCollected > 0);
    const sla = slaList.length ? +(slaList.reduce((s, m) => s + m.slaCompliancePct, 0) / slaList.length).toFixed(1) : 0;
    const approval = handled ? +(((handled - rejected) / handled) * 100).toFixed(1) : 0;
    const denial = handled ? +((rejected / handled) * 100).toFixed(1) : 0;
    return { handled, collected, collectionAmt, rejected, avgTat, sla, approval, denial };
  }, [monthlyMetrics]);

  // TPA breakdown for current month
  const tpaBreakdown = useMemo(() => {
    const map = new Map<string, { tpa: string; claims: number; collected: number; denied: number }>();
    for (const c of claims) {
      if (!inMonth(c.claim_creation_date, month)) continue;
      const tpa = (c.tpa_name || "Unassigned").trim();
      if (!map.has(tpa)) map.set(tpa, { tpa, claims: 0, collected: 0, denied: 0 });
      const e = map.get(tpa)!;
      e.claims += 1;
      const status = (c.claim_status || "").toLowerCase().trim();
      if (SETTLED_STATUSES.has(status)) e.collected += c.settled_amount || 0;
      if (DENIED_STATUSES.has(status)) e.denied += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.claims - a.claims).slice(0, 10);
  }, [claims, month]);

  // Productivity heatmap: staff × last 4 weeks (claims handled count)
  const heatmap = useMemo(() => {
    const weeks: { start: Date; label: string }[] = [];
    const today = new Date();
    for (let i = 3; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay() - i * 7);
      weeks.push({ start, label: `W${4 - i}` });
    }
    return staff.map((m) => {
      const nameKey = (m.name || "").toLowerCase().trim();
      const own = nameKey
        ? claims.filter((c) => (c.hospital_spoc || "").toLowerCase().trim() === nameKey)
        : [];
      const cells = weeks.map((w) => {
        const end = new Date(w.start); end.setDate(w.start.getDate() + 7);
        const count = own.filter((c) => {
          if (!c.claim_creation_date) return false;
          const t = new Date(c.claim_creation_date).getTime();
          return t >= w.start.getTime() && t < end.getTime();
        }).length;
        return { label: w.label, count };
      });
      const max = Math.max(1, ...cells.map((c) => c.count));
      return { name: m.name, cells, max };
    });
  }, [staff, claims]);
  const heatmapMax = Math.max(1, ...heatmap.flatMap((r) => r.cells.map((c) => c.count)));

  const trendData = useMemo(() => {
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(monthKey(d));
    }
    const top = monthlyMetrics.slice(0, 5);
    return months.map((mk) => {
      const point: Record<string, string | number> = { month: monthLabel(mk).slice(0, 6) };
      for (const m of top) {
        const member = staff.find((s) => s.id === m.userId);
        if (!member) continue;
        const metric = buildStaffMetric(member, claims, overrideFor(member.id, mk), (c) => inMonth(c.claim_creation_date, mk), kpiConfig);
        point[m.name] = metric.score;
      }
      return point;
    });
  }, [monthlyMetrics, staff, claims, overrideFor, now, kpiConfig]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    for (let i = 0; i < 4; i++) years.add(String(now.getFullYear() - i));
    return Array.from(years);
  }, [now]);

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push(monthKey(d));
    }
    return opts;
  }, [now]);

  // ──────────────────────────────────────────────────────────────────────
  // Reports — Monthly / Quarterly / Yearly. Both metrics + TPA breakdown
  // are computed from the live claims + overrides feed (auto-linked), so
  // the downloads always reflect what's on screen for the selected period.
  // ──────────────────────────────────────────────────────────────────────
  type Period = "month" | "quarter" | "year";

  const buildReportData = useCallback((period: Period) => {
    let label: string;
    let fileTag: string;
    let claimFilter: (c: Claim) => boolean;
    let overrideKeys: string[];

    if (period === "month") {
      label = monthLabel(month);
      fileTag = month;
      claimFilter = (c) => inMonth(c.claim_creation_date, month);
      overrideKeys = [month];
    } else if (period === "year") {
      label = `Year ${year}`;
      fileTag = year;
      claimFilter = (c) => inYear(c.claim_creation_date, year);
      overrideKeys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    } else {
      const q = quarterOf(new Date(`${month}-01T00:00:00`));
      label = quarterLabel(year, q);
      fileTag = `${year}-Q${q}`;
      claimFilter = (c) => inQuarter(c.claim_creation_date, year, q);
      overrideKeys = quarterMonths(year, q);
    }

    const metrics = staff.map((m) => {
      const ovs = overrides.filter((o) => o.app_user_id === m.id && overrideKeys.includes(o.month));
      const totalQ = ovs.reduce((s, o) => s + (o.query_resolved || 0), 0);
      const lastNote = ovs.sort((a, b) => b.month.localeCompare(a.month))[0]?.notes ?? null;
      const merged: Override = {
        app_user_id: m.id, month: fileTag, query_resolved: totalQ,
        rating_override: null, notes: lastNote,
      };
      return buildStaffMetric(m, claims, merged, claimFilter, kpiConfig);
    }).sort((a, b) => b.score - a.score);

    const handled = metrics.reduce((s, m) => s + m.claimsHandled, 0);
    const collected = metrics.reduce((s, m) => s + m.claimsCollected, 0);
    const collectionAmt = metrics.reduce((s, m) => s + m.collectionAmt, 0);
    const rejected = metrics.reduce((s, m) => s + m.rejectionCount, 0);
    const tatList = metrics.filter((m) => m.avgTat > 0);
    const slaList = metrics.filter((m) => m.slaCompliancePct > 0 || m.claimsCollected > 0);
    const summary = {
      handled, collected, collectionAmt, rejected,
      avgTat: tatList.length ? Math.round(tatList.reduce((s, m) => s + m.avgTat, 0) / tatList.length) : 0,
      sla: slaList.length ? +(slaList.reduce((s, m) => s + m.slaCompliancePct, 0) / slaList.length).toFixed(1) : 0,
      approval: handled ? +(((handled - rejected) / handled) * 100).toFixed(1) : 0,
      denial: handled ? +((rejected / handled) * 100).toFixed(1) : 0,
    };

    const tpaMap = new Map<string, { tpa: string; claims: number; collected: number; denied: number }>();
    for (const c of claims) {
      if (!claimFilter(c)) continue;
      const tpa = (c.tpa_name || "Unassigned").trim();
      if (!tpaMap.has(tpa)) tpaMap.set(tpa, { tpa, claims: 0, collected: 0, denied: 0 });
      const e = tpaMap.get(tpa)!;
      e.claims += 1;
      const status = (c.claim_status || "").toLowerCase().trim();
      if (SETTLED_STATUSES.has(status)) e.collected += c.settled_amount || 0;
      if (DENIED_STATUSES.has(status)) e.denied += 1;
    }
    const tpa = Array.from(tpaMap.values()).sort((a, b) => b.claims - a.claims);

    return { period, label, fileTag, metrics, summary, tpa };
  }, [staff, claims, overrides, month, year, kpiConfig]);

  const exportCsv = (period: Period) => {
    const r = buildReportData(period);
    const rows = [
      [`Staff Performance — ${r.label}`],
      [`Generated: ${new Date().toLocaleString("en-IN")}`],
      [],
      ["KPI Summary"],
      ["Claims Handled", "Collected", "Collection ₹", "Approval %", "Denial %", "Avg TAT", "SLA %"],
      [r.summary.handled, r.summary.collected, r.summary.collectionAmt, r.summary.approval, r.summary.denial, r.summary.avgTat, r.summary.sla],
      [],
      ["Staff Scorecard"],
      ["Name", "Role", "Handled", "Collected", "Collection ₹", "Approval %", "Denial %", "Avg TAT", "SLA %", "Queries", "Score", "Rating", "Notes"],
      ...r.metrics.map((m) => [
        m.name, m.role, m.claimsHandled, m.claimsCollected, m.collectionAmt,
        m.approvalPct, m.rejectionPct, m.avgTat, m.slaCompliancePct, m.queryResolved, m.score,
        m.rating.label.replace(/[🟢🟡🟠🔴]/g, "").trim(), m.notes,
      ]),
      [],
      ["TPA Breakdown"],
      ["TPA / Insurer", "Claims", "Collected ₹", "Denied"],
      ...r.tpa.map((t) => [t.tpa, t.claims, t.collected, t.denied]),
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `staff-performance-${r.fileTag}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV — ${r.label} downloaded`);
  };

  const exportPdf = (period: Period) => {
    const r = buildReportData(period);
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();

    // Header band
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageW, 70, "F");
    doc.setTextColor(255);
    doc.setFontSize(18);
    doc.text("Staff Performance Report", 40, 32);
    doc.setFontSize(11);
    doc.text(r.label, 40, 52);
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleString("en-IN")}`, pageW - 40, 32, { align: "right" });
    doc.text(`Period: ${period.toUpperCase()}`, pageW - 40, 50, { align: "right" });

    // KPI strip
    doc.setTextColor(0);
    autoTable(doc, {
      startY: 86,
      head: [["Claims Handled", "Collected", "Collection ₹", "Approval %", "Denial %", "Avg TAT", "SLA %"]],
      body: [[
        r.summary.handled, r.summary.collected, fmtINR(r.summary.collectionAmt),
        `${r.summary.approval}%`, `${r.summary.denial}%`,
        `${r.summary.avgTat}d`, `${r.summary.sla}%`,
      ]],
      styles: { fontSize: 10, halign: "center", cellPadding: 6 },
      headStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: "bold" },
      bodyStyles: { fontStyle: "bold", fillColor: [255, 255, 255] },
      theme: "grid",
    });

    // Staff scorecard
    autoTable(doc, {
      // @ts-expect-error - autotable adds lastAutoTable to doc at runtime
      startY: (doc as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18,
      head: [["#", "Name", "Role", "Handled", "Collected", "Collection ₹", "Approval %", "Denial %", "TAT", "SLA %", "Queries", "Score", "Rating"]],
      body: r.metrics.map((m, i) => [
        i + 1, m.name, m.role, m.claimsHandled, m.claimsCollected, fmtINR(m.collectionAmt),
        `${m.approvalPct}%`, `${m.rejectionPct}%`, m.avgTat || "—", `${m.slaCompliancePct}%`,
        m.queryResolved, m.score, m.rating.label.replace(/[🟢🟡🟠🔴]/g, "").trim(),
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didDrawPage: () => {
        const w = doc.internal.pageSize.getWidth();
        const h = doc.internal.pageSize.getHeight();
        doc.setFontSize(8); doc.setTextColor(140);
        doc.text(`RCM Buddy · Staff Performance · ${r.label}`, 40, h - 18);
        doc.text(`Page ${doc.getNumberOfPages()}`, w - 40, h - 18, { align: "right" });
      },
    });

    // Low performers
    const lows = r.metrics.filter((m) => m.score < kpiConfig.lowPerformerScore);
    if (lows.length) {
      autoTable(doc, {
        // @ts-expect-error - lastAutoTable runtime field
        startY: (doc as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18,
        head: [[`Low performers (score < ${kpiConfig.lowPerformerScore})`]],
        body: lows.map((m) => [`${m.name} — score ${m.score} · denial ${m.rejectionPct}% · SLA ${m.slaCompliancePct}%${m.notes ? ` · ${m.notes}` : ""}`]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [220, 38, 38], textColor: 255 },
      });
    }

    // TPA breakdown
    if (r.tpa.length) {
      autoTable(doc, {
        // @ts-expect-error - lastAutoTable runtime field
        startY: (doc as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18,
        head: [["TPA / Insurer", "Claims", "Collected ₹", "Denied"]],
        body: r.tpa.map((t) => [t.tpa, t.claims, fmtINR(t.collected), t.denied]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [15, 118, 110], textColor: 255 },
      });
    }

    doc.save(`staff-performance-${r.fileTag}.pdf`);
    toast.success(`PDF — ${r.label} downloaded`);
  };

  const lowPerformers = monthlyMetrics.filter((m) => m.score < kpiConfig.lowPerformerScore).length;

  return (
    <AppLayout>
    <div className="space-y-6 p-4 md:p-6">
      {/* Page header — title + primary actions */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-bold tracking-tight text-foreground">Staff Performance</h1>
            <Badge variant="outline" className="h-5 border-primary/30 bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
              Live
            </Badge>
          </div>
          <p className="max-w-2xl text-[13px] text-muted-foreground">
            KPIs, productivity heatmaps, TPA breakdowns and exportable reports — auto-computed from claims with optional overrides.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost" size="sm"
            onClick={() => setKpiDialog(true)}
            className="h-9 gap-1.5 rounded-xl text-foreground/70 hover:text-foreground hover:bg-muted/70"
          >
            <Settings2 className="h-4 w-4" /> KPI targets
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="h-9 gap-1.5 rounded-xl btn-primary-grad text-primary-foreground px-3.5 shadow-[0_1px_2px_rgba(91,61,245,0.25),0_4px_12px_-2px_rgba(91,61,245,0.35)] hover:shadow-[0_2px_4px_rgba(91,61,245,0.3),0_8px_20px_-4px_rgba(91,61,245,0.45)] transition-all hover:-translate-y-px"
              >
                <FileDown className="h-4 w-4" /> Download report
                <ChevronDown className="h-3.5 w-3.5 opacity-80" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wider">PDF report</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportPdf("month")}>
                <FileDown className="h-3.5 w-3.5 mr-2" /> Monthly — {monthLabel(month)}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportPdf("quarter")}>
                <FileDown className="h-3.5 w-3.5 mr-2" /> Quarterly — {quarterLabel(year, quarterOf(new Date(`${month}-01T00:00:00`)))}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportPdf("year")}>
                <FileDown className="h-3.5 w-3.5 mr-2" /> Yearly — {year}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10.5px] uppercase tracking-wider">CSV (raw data)</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportCsv("month")}>
                <Download className="h-3.5 w-3.5 mr-2" /> Monthly CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCsv("quarter")}>
                <Download className="h-3.5 w-3.5 mr-2" /> Quarterly CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportCsv("year")}>
                <Download className="h-3.5 w-3.5 mr-2" /> Yearly CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Two-column body: KPIs + tabs (left) · filter rail (right) */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-5 min-w-0">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6">
            {loading && monthlyMetrics.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
            ) : (
              <>
                <KpiCard icon={<Users className="h-3.5 w-3.5" />} label="Claims Processed" value={orgKpi.handled.toLocaleString("en-IN")} sub={`${orgKpi.collected} collected`} tone="primary" />
                <KpiCard icon={<IndianRupee className="h-3.5 w-3.5" />} label="Collection" value={fmtINR(orgKpi.collectionAmt)} sub="settled amount" tone="success" />
                <KpiCard icon={<ShieldCheck className="h-3.5 w-3.5" />} label="SLA Compliance" value={`${orgKpi.sla}%`} sub={`target ≤ ${kpiConfig.slaTargetDays}d`} tone={orgKpi.sla >= 90 ? "success" : orgKpi.sla >= 70 ? "warning" : "destructive"} />
                <KpiCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Approval %" value={`${orgKpi.approval}%`} sub={`target ≥ ${kpiConfig.approvalTarget}%`} tone={orgKpi.approval >= kpiConfig.approvalTarget ? "success" : "warning"} />
                <KpiCard icon={<Clock className="h-3.5 w-3.5" />} label="Avg TAT" value={`${orgKpi.avgTat}d`} sub={`target ≤ ${kpiConfig.tatTargetDays}d`} tone={orgKpi.avgTat <= kpiConfig.tatTargetDays ? "success" : "warning"} />
                <KpiCard icon={<XCircle className="h-3.5 w-3.5" />} label="Denial %" value={`${orgKpi.denial}%`} sub={`target ≤ ${kpiConfig.denialMax}%`} tone={orgKpi.denial <= kpiConfig.denialMax ? "success" : "destructive"} />
              </>
            )}
          </div>

          <Tabs defaultValue="monthly" className="space-y-4">
            <TabsList className="h-10 rounded-xl bg-muted/60 p-1">
              <TabsTrigger value="monthly"     className="rounded-lg text-[12.5px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Scorecard</TabsTrigger>
              <TabsTrigger value="charts"      className="rounded-lg text-[12.5px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Charts</TabsTrigger>
              <TabsTrigger value="heatmap"     className="rounded-lg text-[12.5px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Heatmap</TabsTrigger>
              <TabsTrigger value="trend"       className="rounded-lg text-[12.5px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Trend (MoM)</TabsTrigger>
              <TabsTrigger value="yearly"      className="rounded-lg text-[12.5px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Yearly</TabsTrigger>
              <TabsTrigger value="leaderboard" className="rounded-lg text-[12.5px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Leaderboard</TabsTrigger>
            </TabsList>

        <TabsContent value="monthly" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Month: {monthLabel(month)}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <ScorecardTable
                metrics={monthlyMetrics}
                loading={loading}
                onEdit={(u) => setEditing(u)}
                onInlineSave={(userId, patch) => saveOverride(userId, month, patch)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charts" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Team comparison — Score</CardTitle></CardHeader>
            <CardContent className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyMetrics.map((m) => ({ name: m.name, score: m.score, low: m.score < kpiConfig.lowPerformerScore }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-15} textAnchor="end" height={60} />
                  <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {monthlyMetrics.map((m, i) => (
                      <Cell key={i} fill={m.score < kpiConfig.lowPerformerScore ? "hsl(var(--destructive))" : m.score >= 85 ? "hsl(var(--success))" : "hsl(var(--primary))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">TPA-wise — Claims volume (top 10)</CardTitle></CardHeader>
            <CardContent className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tpaBreakdown} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="category" dataKey="tpa" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="claims" fill="hsl(var(--primary))" name="Claims" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="denied" fill="hsl(var(--destructive))" name="Denied" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="heatmap">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Productivity heatmap — last 4 weeks</CardTitle>
              <p className="text-xs text-muted-foreground">Cells coloured by claims handled per staff per week.</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left p-2 font-medium">Staff</th>
                    {heatmap[0]?.cells.map((c) => (
                      <th key={c.label} className="p-2 font-medium text-center">{c.label}</th>
                    ))}
                    <th className="p-2 text-center font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {heatmap.map((row) => {
                    const total = row.cells.reduce((s, c) => s + c.count, 0);
                    return (
                      <tr key={row.name} className="border-t">
                        <td className="p-2 font-medium">{row.name}</td>
                        {row.cells.map((c, i) => {
                          const intensity = c.count / heatmapMax;
                          const bg = c.count === 0
                            ? "hsl(var(--muted) / 0.4)"
                            : `hsl(var(--primary) / ${Math.max(0.15, intensity).toFixed(2)})`;
                          return (
                            <td key={i} className="p-1 text-center">
                              <div
                                className="rounded-md py-2 text-xs font-semibold tabular-nums"
                                style={{ background: bg, color: intensity > 0.5 ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))" }}
                                title={`${c.count} claims`}
                              >
                                {c.count}
                              </div>
                            </td>
                          );
                        })}
                        <td className="p-2 text-center font-bold tabular-nums">{total}</td>
                      </tr>
                    );
                  })}
                  {heatmap.length === 0 && !loading && (
                    <tr><td colSpan={6} className="p-2">
                      <EmptyState icon={<BarChart2 className="h-6 w-6" />} title="No productivity data" description="Once staff are allocated to TPAs and start handling claims, their weekly activity will appear here." />
                    </td></tr>
                  )}
                  {loading && heatmap.length === 0 && (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={`hm-sk-${i}`} className="border-t">
                        <td className="p-2"><Skeleton className="h-4 w-24" /></td>
                        {Array.from({ length: 4 }).map((_, j) => (
                          <td key={j} className="p-1"><Skeleton className="h-8 w-full rounded-md" /></td>
                        ))}
                        <td className="p-2"><Skeleton className="h-4 w-10 mx-auto" /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trend">
          <Card>
            <CardHeader><CardTitle className="text-base">Top 5 staff — score over last 12 months</CardTitle></CardHeader>
            <CardContent className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                  {monthlyMetrics.slice(0, 5).map((m, i) => {
                    const colors = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--accent-foreground))"];
                    return <Line key={m.userId} type="monotone" dataKey={m.name} stroke={colors[i]} strokeWidth={2} dot={false} />;
                  })}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yearly">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-base">Year: {year}</CardTitle>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <ScorecardTable metrics={yearlyMetrics} loading={loading} hideEdit />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaderboard">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-warning" /> Leaderboard — {monthLabel(month)}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {monthlyMetrics.slice(0, 10).map((m, i) => (
                <div key={m.userId} className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${i === 0 ? "bg-warning/20 text-warning" : i < 3 ? "bg-secondary/30" : "bg-muted"}`}>{i + 1}</div>
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.role} · {fmtINR(m.collectionAmt)} collected</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={m.rating.tone}>{m.rating.label}</Badge>
                    <div className="text-right">
                      <div className="text-lg font-bold">{m.score}</div>
                      <div className="text-[10px] text-muted-foreground">/ 100</div>
                    </div>
                  </div>
                </div>
              ))}
              {!loading && monthlyMetrics.length === 0 && (
                <EmptyState
                  icon={<Trophy className="h-6 w-6" />}
                  title="Leaderboard is waiting"
                  description="Allocate TPAs to staff in Settings → Users so claims can be attributed and ranked."
                />
              )}
              {loading && monthlyMetrics.length === 0 && (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={`lb-sk-${i}`} className="flex items-center justify-between rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-7 w-10" />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
          </Tabs>
        </div>

        {/* Right-side filter rail */}
        <aside className="xl:sticky xl:top-[88px] h-max space-y-4 rounded-2xl border bg-card/80 p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Filters</h3>
            {showLowOnly && (
              <button
                onClick={() => setShowLowOnly(false)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground/70">Reporting period</label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map((mk) => <SelectItem key={mk} value={mk}>{monthLabel(mk)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground/70">Year</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="h-9 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="rounded-xl bg-muted/40 p-3">
            <button
              onClick={() => setShowLowOnly((v) => !v)}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors ${
                showLowOnly
                  ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                  : "text-foreground/75 hover:bg-background"
              }`}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Low performers only
              </span>
              {lowPerformers > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">{lowPerformers}</Badge>
              )}
            </button>
          </div>

          <div className="rounded-xl border border-dashed bg-background/40 p-3 text-[11px] text-muted-foreground">
            Showing <span className="font-semibold text-foreground tabular-nums">{monthlyMetrics.length}</span> staff for {monthLabel(month)}.
          </div>
        </aside>
      </div>

      {editing && (
        <OverrideDialog
          userId={editing.userId} userName={editing.userName} month={month}
          existing={overrideFor(editing.userId, month)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void loadOverrides(); }}
        />
      )}

      {kpiDialog && (
        <KpiConfigDialog
          config={kpiConfig}
          onClose={() => setKpiDialog(false)}
          onSave={(c) => { saveKpiConfig(c); setKpiDialog(false); }}
        />
      )}
    </div>
    </AppLayout>
  );
}

function KpiCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone: "primary" | "success" | "warning" | "destructive" }) {
  const sharedTone: "default" | "success" | "denial" | "muted" =
    tone === "destructive" ? "denial" :
    tone === "success" ? "success" :
    "default";
  const iconColor =
    tone === "success" ? "text-success" :
    tone === "destructive" ? "text-destructive" :
    tone === "warning" ? "text-warning" :
    "text-primary";
  const styledIcon = React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, {
        className: `h-3.5 w-3.5 ${iconColor}`,
      })
    : icon;
  return (
    <SharedKpiCard label={label} value={value} tone={sharedTone} icon={styledIcon} caption={sub} />
  );
}

function ScorecardTable({
  metrics, loading, onEdit, hideEdit, onInlineSave,
}: {
  metrics: StaffMetric[];
  loading: boolean;
  onEdit?: (u: { userId: string; userName: string }) => void;
  hideEdit?: boolean;
  onInlineSave?: (userId: string, patch: Partial<Pick<Override, "query_resolved" | "rating_override" | "notes">>) => Promise<boolean>;
}) {
  if (loading) return <ScorecardTableSkeleton hideEdit={hideEdit} />;
  if (metrics.length === 0) return (
    <EmptyState
      icon={<Users className="h-6 w-6" />}
      title="No staff to score yet"
      description="Allocate TPAs to team members in Settings → Users to start tracking performance."
    />
  );
  const editable = !hideEdit && !!onInlineSave;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Staff</TableHead>
          <TableHead className="text-right">Handled</TableHead>
          <TableHead className="text-right">Collected</TableHead>
          <TableHead className="text-right">Revenue ₹</TableHead>
          <TableHead className="text-right">Approval</TableHead>
          <TableHead className="text-right">Denial</TableHead>
          <TableHead className="text-right">Avg TAT</TableHead>
          <TableHead className="text-center">SLA</TableHead>
          <TableHead className="text-right w-[90px]">Queries</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead className="w-[150px]">Rating</TableHead>
          <TableHead className="w-[200px]">Notes</TableHead>
          {!hideEdit && <TableHead className="w-12"></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((m) => (
          <TableRow key={m.userId}>
            <TableCell>
              <div className="font-medium">{m.name}</div>
              <div className="text-[11px] text-muted-foreground">{m.role}</div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{m.claimsHandled}</TableCell>
            <TableCell className="text-right tabular-nums">{m.claimsCollected}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtINR(m.collectionAmt)}</TableCell>
            <TableCell className="text-right tabular-nums">{m.approvalPct}%</TableCell>
            <TableCell className="text-right tabular-nums">{m.rejectionPct}%</TableCell>
            <TableCell className="text-right tabular-nums">{m.avgTat || "—"}</TableCell>
            <TableCell className="text-center">
              <Badge
                variant="outline"
                className={
                  m.slaRisk === "ok" ? "bg-success/15 text-success border-success/40" :
                  m.slaRisk === "warn" ? "bg-warning/15 text-warning border-warning/40" :
                  "bg-destructive/15 text-destructive border-destructive/40"
                }
              >
                {m.slaCompliancePct}%
              </Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums p-1">
              {editable ? (
                <InlineNumber value={m.queryResolved} onCommit={(v) => onInlineSave!(m.userId, { query_resolved: v })} />
              ) : m.queryResolved}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{m.score}</TableCell>
            <TableCell className="p-1">
              {editable ? (
                <InlineText
                  value={m.rating.label.match(/^[🟢🟡🟠🔴]/) ? "" : m.rating.label}
                  placeholder="Auto"
                  onCommit={(v) => onInlineSave!(m.userId, { rating_override: v.trim() || null })}
                  display={<Badge variant="outline" className={m.rating.tone}>{m.rating.label}</Badge>}
                />
              ) : <Badge variant="outline" className={m.rating.tone}>{m.rating.label}</Badge>}
            </TableCell>
            <TableCell className="p-1 max-w-[200px]">
              {editable ? (
                <InlineText value={m.notes} placeholder="Add notes…" onCommit={(v) => onInlineSave!(m.userId, { notes: v.trim() || null })} />
              ) : (
                <span className="text-xs text-muted-foreground truncate block" title={m.notes}>{m.notes || "—"}</span>
              )}
            </TableCell>
            {!hideEdit && (
              <TableCell>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit?.({ userId: m.userId, userName: m.name })} aria-label={`Edit overrides for ${m.name}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function InlineNumber({ value, onCommit }: { value: number; onCommit: (v: number) => Promise<boolean> }) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  return (
    <Input
      type="number" value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { const n = Number(local) || 0; if (n !== value) void onCommit(n); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-7 w-[70px] ml-auto text-right tabular-nums px-2"
    />
  );
}

function InlineText({ value, placeholder, onCommit, display }: {
  value: string; placeholder?: string;
  onCommit: (v: string) => Promise<boolean>; display?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className="text-left w-full truncate text-xs hover:bg-muted/50 rounded px-2 py-1 min-h-[28px] focus:outline-none focus:ring-1 focus:ring-ring"
        title={value || placeholder}>
        {display ?? (value ? <span>{value}</span> : <span className="text-muted-foreground italic">{placeholder}</span>)}
      </button>
    );
  }
  return (
    <Input autoFocus value={local} placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { setEditing(false); if (local !== value) void onCommit(local); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setLocal(value); setEditing(false); }
      }}
      className="h-7 text-xs px-2"
    />
  );
}

function OverrideDialog({
  userId, userName, month, existing, onClose, onSaved,
}: {
  userId: string; userName: string; month: string;
  existing: Override | undefined; onClose: () => void; onSaved: () => void;
}) {
  const [queryResolved, setQueryResolved] = useState(String(existing?.query_resolved ?? 0));
  const [rating, setRating] = useState(existing?.rating_override ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const payload = {
      org_id: getCurrentOrgId(), app_user_id: userId, month,
      query_resolved: Number(queryResolved) || 0,
      rating_override: rating.trim() || null, notes: notes.trim() || null,
    };
    const { error } = await supabase.from("staff_scorecard_overrides").upsert(payload, { onConflict: "org_id,app_user_id,month" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{userName} — {monthLabel(month)}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Queries Resolved</label>
            <Input type="number" value={queryResolved} onChange={(e) => setQueryResolved(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Rating Override (optional)</label>
            <Input value={rating} onChange={(e) => setRating(e.target.value)} placeholder="Leave blank to auto-rate" />
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Pre-auth expert, needs coaching on denials, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiConfigDialog({ config, onClose, onSave }: { config: KpiConfig; onClose: () => void; onSave: (c: KpiConfig) => void }) {
  const [c, setC] = useState(config);
  const upd = (k: keyof KpiConfig, v: number) => setC((cur) => ({ ...cur, [k]: v }));
  const dirty = JSON.stringify(c) !== JSON.stringify(config);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" /> Configure KPI Targets
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            These thresholds drive the green / amber / red colour coding across all KPI tiles
            and the Low Performer filter. Changes apply instantly and are saved on this device.
          </p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Approval target" suffix="%" value={c.approvalTarget} onChange={(v) => upd("approvalTarget", v)} hint="≥ this is green" />
          <Field label="Max denial" suffix="%" value={c.denialMax} onChange={(v) => upd("denialMax", v)} hint="> this turns red" />
          <Field label="TAT target" suffix="days" value={c.tatTargetDays} onChange={(v) => upd("tatTargetDays", v)} hint="≤ this is green" />
          <Field label="SLA target" suffix="days" value={c.slaTargetDays} onChange={(v) => upd("slaTargetDays", v)} hint="claim → settlement" />
          <Field label="Collection target" suffix="%" value={c.collectionTarget} onChange={(v) => upd("collectionTarget", v)} hint="vs settled amt" />
          <Field label="Low performer score" suffix="<" value={c.lowPerformerScore} onChange={(v) => upd("lowPerformerScore", v)} hint="flags staff under this" />
        </div>
        <DialogFooter className="sm:justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setC(DEFAULT_KPIS)}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(c)} disabled={!dirty}>Save targets</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, onChange, suffix, hint }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="relative">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-9 pr-12 tabular-nums"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-[10.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ---------------- Loading & empty-state helpers ---------------- */

function KpiCardSkeleton() {
  return (
    <div className="rounded-2xl ring-1 ring-border/60 bg-muted/30 p-3.5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-6 rounded-lg" />
      </div>
      <Skeleton className="mt-2 h-6 w-24" />
      <Skeleton className="mt-2 h-3 w-16" />
    </div>
  );
}

function ScorecardTableSkeleton({ hideEdit }: { hideEdit?: boolean }) {
  const cols = hideEdit ? 12 : 13;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: cols }).map((_, i) => (
            <TableHead key={i}><Skeleton className="h-3 w-16" /></TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 6 }).map((_, r) => (
          <TableRow key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <TableCell key={c}>
                <Skeleton className={`h-3.5 ${c === 0 ? "w-32" : "w-12"}`} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-accent/10 blur-xl" />
        <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-muted to-background border shadow-sm text-muted-foreground">
          {icon}
        </div>
      </div>
      <h4 className="text-[14px] font-semibold text-foreground">{title}</h4>
      <p className="mt-1.5 max-w-sm text-[12.5px] text-muted-foreground leading-relaxed">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

