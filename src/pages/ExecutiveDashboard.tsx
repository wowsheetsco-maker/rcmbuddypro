import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "@/lib/router-compat";
import {
  AlertTriangle, Flame, FileWarning, ChevronRight, ChevronLeft, MousePointerClick, History, X,
  Home, LayoutDashboard, ListChecks, Search as SearchIcon, MessageSquare,
  Users, BarChart3, ShieldAlert, CheckCircle2, Download, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useDqRules } from "@/hooks/useDqRules";
import { useGlobalFilter } from "@/components/global-filter-context";
import { computeDiscrepancy } from "@/lib/discrepancy";
import { formatInrShort as formatInr, type Claim } from "@/data/mockClaims";
import ExecutiveDrillDownDrawer from "@/components/ExecutiveDrillDownDrawer";
import PdfExportDialog from "@/components/pdf/PdfExportDialog";
import DateRangeQuickPicker from "@/components/DateRangeQuickPicker";
import TpaInsurerFilter, { useTpaFilter } from "@/components/TpaInsurerFilter";
import { cn } from "@/lib/utils";

type AmountField =
  | "claimed_amount"
  | "approved_amount"
  | "settled_amount"
  | "outstanding_amount";

interface DrillState {
  title: string;
  subtitle?: string;
  claims: Claim[];
  amountField?: AmountField;
  amountLabel?: string;
  insight?: string;
}

const ROLE_STORAGE_KEY = "rcm-buddy-role";

const SETTLED = new Set(["settled", "paid", "closed"]);
const DENIED = new Set([
  "pre auth denied", "claim denied", "discharge denied",
  "enhancement denied", "denied", "rejected",
]);
const SUBMITTED_NEGATIVE = new Set(["draft", "not submitted"]);

const STATUS_COLORS: Record<string, string> = {
  Pending: "hsl(217 91% 60%)",
  Settled: "hsl(160 70% 38%)",
  Denied: "hsl(0 75% 55%)",
  "Under Query": "hsl(38 92% 55%)",
};

function classifyStatus(s: string): keyof typeof STATUS_COLORS {
  const k = (s || "").toLowerCase();
  if (SETTLED.has(k)) return "Settled";
  if (DENIED.has(k)) return "Denied";
  if (k.includes("query")) return "Under Query";
  return "Pending";
}

function ageDays(d?: string | null) {
  if (!d) return 0;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function inferDept(c: Claim): string {
  const t = `${c.diagnosis || ""} ${c.treatment || ""}`.toLowerCase();
  if (/cardio|heart|angio|cabg|stent/.test(t)) return "Cardiology";
  if (/onco|cancer|chemo|tumor|tumour/.test(t)) return "Oncology";
  if (/ortho|knee|hip|fracture|joint/.test(t)) return "Orthopaedics";
  if (/neuro|brain|stroke|spine/.test(t)) return "Neurology";
  if (/uro|kidney|renal|prostate/.test(t)) return "Urology";
  if (/nephr|dialysis/.test(t)) return "Nephrology";
  if (/gastr|liver|hepat|gi|colon/.test(t)) return "Gastroenterology";
  if (/ent|ear|nose|throat|sinus/.test(t)) return "ENT";
  if (/gyn|obs|preg|delivery/.test(t)) return "Obstetrics";
  if (/paed|child|neonat/.test(t)) return "Paediatrics";
  return "General Surgery";
}

interface Kpi {
  label: string;
  value: string;
  caption?: string;
  hint?: string;
  drillLabel?: string;
  /** `hero` is reserved for the 3 top-line CFO numbers; everything else
   *  uses the standard size to keep visual hierarchy clear. */
  size?: "hero" | "default";
  accent?: "default" | "success" | "warn" | "danger" | "muted" | "info";
  onClick?: () => void;
}

function KpiTile({ label, value, caption, hint, drillLabel, accent = "default", size = "default", onClick }: Kpi) {
  const accentBar = {
    default: "border-l-primary",
    success: "border-l-success",
    warn: "border-l-aging-60",
    // "danger" only used for denial/SLA metrics — paint with denial token
    danger: "border-l-denial",
    muted: "border-l-muted-foreground/40",
    info: "border-l-accent",
  }[accent];
  const valueTone = {
    default: "text-foreground",
    success: "text-success",
    warn: "text-aging-60",
    danger: "text-denial",
    muted: "text-muted-foreground",
    info: "text-accent",
  }[accent];
  const interactive = !!onClick;
  const isHero = size === "hero";
  return (
    <Card
      variant={isHero ? "hero" : "default"}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${label}: ${value}. ${drillLabel ?? "Click to view contributing claims"}` : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`group relative border-l-2 ${accentBar} transition-all ${
        interactive
          ? "cursor-pointer hover:shadow-md hover:bg-muted/30 hover:-translate-y-[1px] active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1"
          : ""
      }`}
    >
      {interactive && (
        <span className="pointer-events-none absolute right-2 top-2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
          <MousePointerClick className="h-3 w-3 text-primary" />
        </span>
      )}
      <CardContent className={isHero ? "p-5" : "p-3.5"}>
        <div className="metric-meta">{label}</div>
        <div className={`mt-2 leading-none ${valueTone} ${isHero ? "metric-hero" : "metric-primary"}`}>
          {value}
        </div>
        {caption && (
          <div className="mt-2 text-[11px] text-muted-foreground leading-snug">
            {caption}
          </div>
        )}
        {interactive && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary group-hover:underline">
              View contributing claims <ChevronRight className="h-3 w-3" />
            </span>
            {hint && hint !== "Click to view" && (
              <span className="text-[9px] text-muted-foreground/70">{hint}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title, right, children,
}: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="flex items-center justify-between border-l-2 border-primary pl-2 mb-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider">
            {title}
          </h3>
          {right}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function FunnelRow({
  label, count, amount, pct, barColor, delta, onClick,
}: { label: string; count: number; amount: number; pct: number; barColor: string; delta?: string; onClick?: () => void }) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      className={`grid grid-cols-[90px_40px_1fr_80px_50px] md:grid-cols-[140px_60px_1fr_120px_70px] items-center gap-2 md:gap-3 py-2 border-b last:border-b-0 ${
        interactive ? "cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded transition-colors" : ""
      }`}
    >
      <div className="text-[12px] md:text-sm font-medium truncate">{label}</div>
      <div className="text-[10px] md:text-[11px] text-rose-600 font-medium">{delta || ""}</div>
      <div className="h-6 rounded-md bg-muted/50 overflow-hidden relative">
        <div
          className="h-full flex items-center px-2 text-[10px] md:text-[11px] font-medium text-white whitespace-nowrap"
          style={{ width: `${Math.max(2, pct)}%`, backgroundColor: barColor }}
        >
          {count.toLocaleString("en-IN")} <span className="hidden sm:inline ml-1">claims</span>
        </div>
      </div>
      <div className="text-right text-[12px] md:text-sm font-semibold tabular-nums">{formatInr(amount)}</div>
      <div className="text-right text-[12px] md:text-sm font-semibold tabular-nums text-emerald-600">{pct.toFixed(1)}%</div>
    </div>
  );
}

export default function ExecutiveDashboard() {
  const { claims: rawClaims, loading } = useLiveClaims();
  const { rules } = useDqRules();
  const { matchesBranch, isWithin, from: filterFrom, to: filterTo, groupIds, branchIds } = useGlobalFilter();
  const { matches: matchesTpa, selected: selectedTpas } = useTpaFilter();
  const role = typeof window !== "undefined" ? localStorage.getItem(ROLE_STORAGE_KEY) : "cfo";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [lastDrillMeta, setLastDrillMeta] = useState<{ title: string; subtitle?: string; count: number; ts: number } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Derive snapshot date span (claim_creation_date min/max) for footer.
  const snapshotRange = useMemo(() => {
    let min: string | null = null;
    let max: string | null = null;
    for (const c of rawClaims) {
      const d = c.claim_creation_date;
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    return { min, max };
  }, [rawClaims]);
  // Persisted across refreshes / back-forward navigation so users return to the
  // exact same view (collapsed hero vs full breakdown).
  const [showFull, setShowFull] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("rcm-buddy-exec-show-full") === "1";
  });
  useEffect(() => {
    try { localStorage.setItem("rcm-buddy-exec-show-full", showFull ? "1" : "0"); } catch { /* noop */ }
  }, [showFull]);

  // Track the previous in-app route so the breadcrumb "Back" link can return
  // the user to the dashboard context they came from (e.g. /claims, /my-tasks).
  const [prevPath, setPrevPath] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("rcm-buddy-exec-prev-path");
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("rcm-buddy-exec-current-path");
    if (stored && stored !== pathname) {
      sessionStorage.setItem("rcm-buddy-exec-prev-path", stored);
      setPrevPath(stored);
    }
    sessionStorage.setItem("rcm-buddy-exec-current-path", pathname);
  }, [pathname]);

  // Quality gating happens at import; the global hospital-branch filter is
  // applied here so every KPI, chart and drill-down respects the user's scope.
  const claims = useMemo(
    () => rawClaims.filter((c) =>
      matchesBranch({
        hospital_group_id: c.hospital_group_id,
        hospital_branch_id: c.hospital_branch_id,
      }) && isWithin(c.claim_creation_date) && matchesTpa(c.tpa_name),
    ),
    [rawClaims, matchesBranch, isWithin, matchesTpa],
  );

  const tpaOptions = useMemo(
    () => Array.from(new Set(rawClaims.map((c) => (c.tpa_name || "Unknown").trim()))),
    [rawClaims],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem("rcm-buddy-exec-last-drill");
      if (raw) setLastDrillMeta(JSON.parse(raw));
    } catch { /* noop */ }
  }, []);

  const isOpen = (s: string) => !SETTLED.has((s || "").toLowerCase());
  const isDenied = (s: string) => DENIED.has((s || "").toLowerCase());
  const openDrill = (state: DrillState) => {
    setDrill(state);
    const meta = { title: state.title, subtitle: state.subtitle, count: state.claims.length, ts: Date.now() };
    setLastDrillMeta(meta);
    try { localStorage.setItem("rcm-buddy-exec-last-drill", JSON.stringify(meta)); } catch { /* noop */ }
  };
  const clearLastDrill = () => {
    setLastDrillMeta(null);
    try { localStorage.removeItem("rcm-buddy-exec-last-drill"); } catch { /* noop */ }
  };

  const m = useMemo(() => {
    const total = claims.length;
    const claimed = claims.reduce((s, c) => s + (c.claimed_amount || 0), 0);
    const approved = claims.reduce((s, c) => s + (c.approved_amount || 0), 0);
    const settled = claims.reduce((s, c) => s + (c.settled_amount || 0), 0);
    const outstanding = claims.reduce((s, c) => s + (c.outstanding_amount || 0), 0);
    const denials = claims.filter((c) => DENIED.has((c.claim_status || "").toLowerCase()));
    const settledClaims = claims.filter((c) => SETTLED.has((c.claim_status || "").toLowerCase()));
    const denialAmt = denials.reduce((s, c) => s + (c.claimed_amount || 0), 0);
    // Underpayment = same formula and thresholds as the Discrepancy Tracker:
    // gap = Approved − (Settled + TDS), only flagged when claim is closed/settled
    // and gap exceeds MAX(rules.discrepancy_min_inr, rules.discrepancy_min_pct% of approved).
    const underpayClaims: Claim[] = [];
    let underpayments = 0;
    for (const c of claims) {
      const d = computeDiscrepancy(c, rules);
      if (d.isDiscrepant) {
        underpayClaims.push(c);
        underpayments += d.amount;
      }
    }
    const unsubmitted = claims
      .filter((c) => SUBMITTED_NEGATIVE.has((c.claim_status || "").toLowerCase()))
      .reduce((s, c) => s + (c.claimed_amount || 0), 0);
    const ncr = approved > 0 ? (settled / approved) * 100 : 0;
    const denialRate = total > 0 ? (denials.length / total) * 100 : 0;
    const underpayRate = approved > 0 ? (underpayments / approved) * 100 : 0;
    const submitted = total - claims.filter((c) => SUBMITTED_NEGATIVE.has((c.claim_status || "").toLowerCase())).length;
    const submittedAmt = claimed - unsubmitted;
    const ccr = submitted > 0
      ? ((submitted - denials.length) / submitted) * 100
      : 0;

    // Aging
    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0 };
    const bucketCounts = { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0 };
    claims.forEach((c) => {
      if (SETTLED.has((c.claim_status || "").toLowerCase())) return;
      const d = ageDays(c.claim_creation_date);
      const amt = c.outstanding_amount || 0;
      if (d <= 30) { buckets["0-30"] += amt; bucketCounts["0-30"]++; }
      else if (d <= 60) { buckets["31-60"] += amt; bucketCounts["31-60"]++; }
      else if (d <= 90) { buckets["61-90"] += amt; bucketCounts["61-90"]++; }
      else if (d <= 180) { buckets["91-180"] += amt; bucketCounts["91-180"]++; }
      else { buckets["180+"] += amt; bucketCounts["180+"]++; }
    });
    const arOver90 = buckets["91-180"] + buckets["180+"];
    const irdaiRisk = claims.filter((c) => c.is_irdai_breach).length;

    // TAT
    let dischargeToSubmissionDays = 0, dts = 0;
    let approvalToPaymentDays = 0, atp = 0;
    let breached48h = 0;
    claims.forEach((c) => {
      if (c.date_of_discharge && c.doc_submission_date) {
        const d = (new Date(c.doc_submission_date).getTime() - new Date(c.date_of_discharge).getTime()) / 86_400_000;
        if (!Number.isNaN(d) && d >= 0) { dischargeToSubmissionDays += d; dts++; if (d > 2) breached48h++; }
      }
      if (c.payment_update_date && c.claim_creation_date) {
        const d = (new Date(c.payment_update_date).getTime() - new Date(c.claim_creation_date).getTime()) / 86_400_000;
        if (!Number.isNaN(d) && d >= 0) { approvalToPaymentDays += d; atp++; }
      }
    });
    const avgDts = dts > 0 ? dischargeToSubmissionDays / dts : 0;
    const avgAtp = atp > 0 ? approvalToPaymentDays / atp : 0;

    // DIAR
    const openOutstanding = claims
      .filter((c) => !SETTLED.has((c.claim_status || "").toLowerCase()))
      .reduce((s, c) => s + (c.outstanding_amount || 0), 0);
    const dailyRevRun = claimed / 365;
    const diar = dailyRevRun > 0 ? openOutstanding / dailyRevRun : 0;

    // Status pie
    const statusAgg: Record<string, number> = {};
    claims.forEach((c) => {
      const k = classifyStatus(c.claim_status);
      statusAgg[k] = (statusAgg[k] || 0) + 1;
    });
    const statusData = Object.entries(statusAgg).map(([name, value]) => ({ name, value }));

    // Top TPA outstanding
    const tpaAgg: Record<string, number> = {};
    claims.forEach((c) => {
      if (SETTLED.has((c.claim_status || "").toLowerCase())) return;
      const k = c.tpa_name || "Unknown";
      tpaAgg[k] = (tpaAgg[k] || 0) + (c.outstanding_amount || 0);
    });
    const topTpa = Object.entries(tpaAgg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));

    // Departments
    const deptAgg: Record<string, number> = {};
    claims.forEach((c) => {
      const k = inferDept(c);
      deptAgg[k] = (deptAgg[k] || 0) + 1;
    });
    const deptData = Object.entries(deptAgg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));

    // AR segmentation
    const high = claims.filter((c) => !SETTLED.has((c.claim_status || "").toLowerCase()) && c.outstanding_amount > 500_000);
    const mid = claims.filter((c) => !SETTLED.has((c.claim_status || "").toLowerCase()) && c.outstanding_amount > 100_000 && c.outstanding_amount <= 500_000);
    const low = claims.filter((c) => !SETTLED.has((c.claim_status || "").toLowerCase()) && c.outstanding_amount > 0 && c.outstanding_amount <= 100_000);

    // Top denial reasons (by insurer_comments fallback)
    const denialAgg: Record<string, number> = {};
    denials.forEach((c) => {
      const reason = (c.insurer_comments || "Unspecified").split(/[.,;\n]/)[0].trim().slice(0, 50) || "Unspecified";
      denialAgg[reason] = (denialAgg[reason] || 0) + 1;
    });
    const topDenialReasons = Object.entries(denialAgg).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Top TPAs outstanding (5)
    const top5Tpa = topTpa.slice(0, 5);

    // Workflow status counts
    const docsPending = claims.filter((c) => /docs?\s*pending|enhancement requested/i.test(c.claim_status || "")).length;
    const underProcess = claims.filter((c) => /process|enhancement approved|pre auth approved|claim approved/i.test(c.claim_status || "")).length;
    const activeInHospital = claims.filter((c) => !c.date_of_discharge).length;
    const activeAmt = claims.filter((c) => !c.date_of_discharge).reduce((s, c) => s + (c.outstanding_amount || 0), 0);
    const docsNotSubmitted = claims.filter((c) => SUBMITTED_NEGATIVE.has((c.claim_status || "").toLowerCase())).length;
    const docsNotSubmittedAmt = claims.filter((c) => SUBMITTED_NEGATIVE.has((c.claim_status || "").toLowerCase())).reduce((s, c) => s + (c.outstanding_amount || 0), 0);
    const liveAR = openOutstanding - activeAmt;
    const oldestDays = Math.max(0, ...claims.filter((c) => !SETTLED.has((c.claim_status || "").toLowerCase())).map((c) => ageDays(c.claim_creation_date)));

    // ---- Per-KPI insights (what drives the number + what to verify) ----
    const topTpaName = topTpa[0]?.name;
    const topTpaAmt = topTpa[0]?.value || 0;
    const topDeptName = deptData[0]?.name;
    const topDeptCount = deptData[0]?.value || 0;
    const topDenial = topDenialReasons[0];
    const arOver90Pct = openOutstanding > 0 ? (arOver90 / openOutstanding) * 100 : 0;
    const oldestOpen = claims
      .filter((c) => !SETTLED.has((c.claim_status || "").toLowerCase()))
      .reduce<Claim | null>((acc, c) => (acc && acc.outstanding_amount > c.outstanding_amount ? acc : c), null);

    const insights: Record<string, string> = {
      claimed: topDeptName
        ? `${topDeptName} drives volume (${topDeptCount} claims). Verify high-ticket admissions and missing pre-auth.`
        : `Spread across ${total} claims. Verify volume mix.`,
      approved: `Gap of ${formatInr(claimed - approved)} vs billed. Audit deductions and copay entries on top TPAs.`,
      settled: topTpaName
        ? `${topTpaName} carries ${formatInr(topTpaAmt)} unpaid. Chase oldest UTRs and reconcile receipts.`
        : `Reconcile against UTRs and bank receipts.`,
      liveAR: `${arOver90Pct.toFixed(0)}% of AR is 90+ days. Verify SLA breach list and oldest open: ${oldestOpen?.patient_name ?? "—"}.`,
      ncr: underpayments > 0
        ? `Short-paid ${formatInr(underpayments)} (Approved − Settled). Verify payer remittance vs approval letters.`
        : `Healthy collections — confirm no pending UTRs.`,
      diar: `${formatInr(openOutstanding)} open ÷ ${formatInr(dailyRevRun)}/day. Highest aging from ${topTpaName ?? "top TPA"}.`,
      velocity: `Avg ${avgAtp.toFixed(1)}d approval→payment. Slowest insurer should be reviewed for SLA breach.`,
      irdai: irdaiRisk > 0
        ? `${irdaiRisk} claims past 90d, ${formatInr(arOver90)} at risk. File SLA escalation immediately.`
        : `No SLA breaches — keep aging buckets monitored weekly.`,
      denialRate: topDenial
        ? `Top reason: "${topDenial[0]}" (${topDenial[1]} claims). Coach front-desk on doc completeness.`
        : `${denials.length} denials. Drill to inspect rejection reasons.`,
      underpay: `Approved > Settled gap. Common causes: room-rent cap, non-medical exclusions, copay miscalc.`,
      active: `${activeInHospital} patients in-hospital. Verify pre-auth approval and enhancement triggers daily.`,
      docsNotSubmitted: `${docsNotSubmitted} claims sitting in draft. Enforce 48-hr discharge-to-submission SLA.`,
    };

    return {
      total, claimed, approved, settled, outstanding,
      denials, denialAmt, denialRate, underpayments, underpayClaims, underpayRate, unsubmitted,
      ncr, ccr, settledClaimsCount: settledClaims.length,
      submitted, submittedAmt,
      buckets, bucketCounts, arOver90, irdaiRisk,
      avgDts, avgAtp, breached48h,
      diar, openOutstanding, dailyRevRun,
      statusData, topTpa, deptData,
      high, mid, low,
      topDenialReasons, top5Tpa,
      docsPending, underProcess, activeInHospital, activeAmt, docsNotSubmitted, docsNotSubmittedAmt, liveAR,
      oldestDays, insights,
    };
  }, [claims, rules]);

  if (role && role !== "cfo" && role !== "admin") return <Navigate to="/" replace />;

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-3">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-72" />
        </div>
      </AppLayout>
    );
  }

  const totalLeakage = m.denialAmt + m.underpayments + m.unsubmitted;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Breadcrumbs — always present so users know where they are */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          {prevPath && prevPath !== pathname && (
            <>
              <button
                type="button"
                onClick={() => navigate(prevPath)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 -ml-1.5 hover:bg-muted hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                aria-label={`Back to ${prevPath}`}
                title={`Back to ${prevPath}`}
              >
                <ChevronLeft className="h-3 w-3" /> Back
              </button>
              <span className="opacity-40">·</span>
            </>
          )}
          <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
            <Home className="h-3 w-3" /> Home
          </Link>
          <ChevronRight className="h-3 w-3 opacity-60" />
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <LayoutDashboard className="h-3 w-3" /> Executive Dashboard
          </span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Executive Dashboard</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {m.total.toLocaleString("en-IN")} claims
              {filterFrom || filterTo
                ? ` · ${filterFrom ? filterFrom.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"} → ${filterTo ? filterTo.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}`
                : " · All time"}
              {" "}· Generated {new Date().toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {lastDrillMeta && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 pl-2.5 pr-1 py-1">
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="text-[11px] leading-tight">
                  <span className="text-muted-foreground">Last drilled:</span>{" "}
                  <span className="font-medium">{lastDrillMeta.title}</span>
                  <span className="text-muted-foreground ml-1">· {lastDrillMeta.count} claims</span>
                  {lastDrillMeta.subtitle && (
                    <span className="text-muted-foreground ml-1 hidden md:inline">· {lastDrillMeta.subtitle}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={clearLastDrill}
                  aria-label="Clear last drilled filter"
                  className="ml-1 rounded p-1 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <DateRangeQuickPicker />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              disabled={previewOpen || loading}
              className="h-8"
            >
              {previewOpen ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Preview open…</>
              ) : (
                <><Download className="h-3.5 w-3.5 mr-1.5" /> Download PDF</>
              )}
            </Button>
          </div>
        </div>

        <div ref={exportRef} className="space-y-4 bg-background">


        {/* Quick actions — one-click jumps to the highest-value workflows */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            { label: "My Tasks",         caption: "Today's queue",       to: "/my-tasks",                              icon: ListChecks,    accent: "text-primary" },
            { label: "All Claims",       caption: "Browse & filter",     to: "/claims",                                icon: SearchIcon,    accent: "text-foreground" },
            { label: "Outstanding",      caption: "Send reminders",      to: "/communications/outstanding-reminders",  icon: MessageSquare, accent: "text-amber-600 dark:text-amber-400" },
            { label: "Denials",          caption: "File appeals",        to: "/claims/denials",                        icon: ShieldAlert,   accent: "text-denial" },
            { label: "Staff Performance", caption: "Scorecard",          to: "/analytics/staff-scorecard",             icon: Users,         accent: "text-accent" },
            { label: "Cashflow Trend",   caption: "Open analytics",      to: "/analytics/cash-flow",                   icon: BarChart3,     accent: "text-success" },
          ].map((q) => {
            const Icon = q.icon;
            const isActive = pathname === q.to || pathname.startsWith(q.to + "/");
            return (
              <Link
                key={q.to}
                to={q.to}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                  isActive
                    ? "border-primary/60 bg-primary/5 shadow-sm ring-1 ring-primary/20"
                    : "border-border bg-card hover:border-primary/40 hover:shadow-sm hover:-translate-y-[1px]",
                )}
              >
                {isActive && (
                  <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-r bg-primary" />
                )}
                <span className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors",
                  isActive ? "bg-primary/15 text-primary" : `bg-muted/60 ${q.accent}`,
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn(
                    "block truncate text-[12.5px] font-semibold",
                    isActive ? "text-primary" : "text-foreground",
                  )}>{q.label}</span>
                  <span className="block truncate text-[10.5px] text-muted-foreground">
                    {isActive ? "You're here" : q.caption}
                  </span>
                </span>
                {isActive ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-primary transition-colors" />
                )}
              </Link>
            );
          })}
        </div>

        {/* What needs attention */}
        <Card className="bg-zinc-900 text-zinc-100 border-zinc-800 shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Flame className="h-4 w-4 text-amber-400" /> What Needs Your Attention Today
              </div>
              <div className="text-[11px] text-zinc-400">
                {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => openDrill({
                  title: "Denied claims — file appeal",
                  subtitle: `${m.denials.length} denials · ${formatInr(m.denialAmt)} recoverable`,
                  claims: m.denials,
                  amountField: "claimed_amount",
                  amountLabel: "Claimed",
                })}
                className="text-left rounded-md bg-amber-500/15 border border-amber-500/30 px-3 py-2.5 hover:bg-amber-500/25 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <div className="text-[13px] font-medium text-amber-200">
                  ⚠️ {m.denials.length} denied — file appeal before 30-day window closes
                </div>
                <div className="text-[11px] text-amber-200/70 mt-0.5">
                  {formatInr(m.denialAmt)} recoverable · click to view list
                </div>
              </button>
              <button
                type="button"
                onClick={() => openDrill({
                  title: "Underpayment discrepancies",
                  subtitle: `${m.underpayClaims.length} settled claims · ${formatInr(m.underpayments)} short-paid (Approved − Settled − TDS, threshold-flagged)`,
                  claims: m.underpayClaims,
                  amountField: "approved_amount",
                  amountLabel: "Approved",
                })}
                className="text-left rounded-md bg-emerald-500/10 border border-emerald-500/30 px-3 py-2.5 hover:bg-emerald-500/20 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <div className="text-[13px] font-medium text-emerald-200">
                  💰 {m.underpayClaims.length} underpayment discrepancies — raise with TPA
                </div>
                <div className="text-[11px] text-emerald-200/70 mt-0.5">
                  {formatInr(m.underpayments)} short-paid · matches Discrepancy Tracker
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* CFO hero — 3 numbers, scale-driven hierarchy */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            variant="hero"
            role="button"
            tabIndex={0}
            onClick={() => openDrill({ title: "Live AR portfolio", subtitle: `${formatInr(m.liveAR)} outstanding`, claims: claims.filter(c => isOpen(c.claim_status) && c.date_of_discharge), amountField: "outstanding_amount", amountLabel: "Outstanding", insight: m.insights.liveAR })}
            className="cursor-pointer hover:shadow-lg transition-shadow"
          >
            <CardContent className="p-6">
              <div className="metric-meta">Outstanding AR</div>
              <div className="metric-hero mt-2">{formatInr(m.liveAR)}</div>
              <div className="metric-secondary mt-2">{Math.round(m.diar)} days in AR · {m.irdaiRisk} SLA 90+</div>
            </CardContent>
          </Card>
          <Card
            variant="hero"
            role="button"
            tabIndex={0}
            onClick={() => openDrill({ title: "Settled claims (Collections)", subtitle: `${formatInr(m.settled)} collected`, claims: claims.filter(c => SETTLED.has((c.claim_status||"").toLowerCase())), amountField: "settled_amount", amountLabel: "Settled", insight: m.insights.settled })}
            className="cursor-pointer hover:shadow-lg transition-shadow"
          >
            <CardContent className="p-6">
              <div className="metric-meta">Collections</div>
              <div className="metric-hero mt-2 text-success">{formatInr(m.settled)}</div>
              <div className="metric-secondary mt-2">{m.settledClaimsCount} settled · NCR {m.ncr.toFixed(1)}%</div>
            </CardContent>
          </Card>
          <Card
            variant={m.denialRate > 10 ? "denial" : "hero"}
            role="button"
            tabIndex={0}
            onClick={() => openDrill({ title: "Denied / rejected claims", subtitle: `${m.denials.length} denials`, claims: m.denials, amountField: "claimed_amount", amountLabel: "Claimed", insight: m.insights.denialRate })}
            className="cursor-pointer hover:shadow-lg transition-shadow"
          >
            <CardContent className="p-6">
              <div className="metric-meta">Denial Rate</div>
              <div className={`metric-hero mt-2 ${m.denialRate > 10 ? "text-denial" : "text-foreground"}`}>{m.denialRate.toFixed(1)}%</div>
              <div className="metric-secondary mt-2">{m.denials.length} denied · {formatInr(m.denialAmt)} recoverable</div>
            </CardContent>
          </Card>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <div className="text-xs text-muted-foreground">
            {showFull ? "Showing full breakdown" : "Detailed KPIs, charts, and aging buckets are collapsed."}
          </div>
          <button
            type="button"
            onClick={() => setShowFull((v) => !v)}
            className="text-xs font-medium px-3 py-1.5 rounded-md border bg-background hover:bg-muted transition-colors"
          >
            {showFull ? "Hide breakdown" : "Show full breakdown"}
          </button>
        </div>

        {showFull && (<>
        {/* KPI grid - row 1 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile label="Total Claimed (Billed)" value={formatInr(m.claimed)} caption={`${m.total.toLocaleString("en-IN")} total claims`} accent="default"
            onClick={() => openDrill({ title: "All claims (Total Billed)", subtitle: `${m.total} claims · ${formatInr(m.claimed)} billed`, claims, amountField: "claimed_amount", amountLabel: "Claimed", insight: m.insights.claimed })} />
          <KpiTile label="Total Approved" value={formatInr(m.approved)} caption={`${claims.filter(c => c.approved_amount > 0).length} claims with approval`} accent="info"
            onClick={() => openDrill({ title: "Approved claims", subtitle: `${formatInr(m.approved)} approved across ${claims.filter(c => c.approved_amount > 0).length} claims`, claims: claims.filter(c => c.approved_amount > 0), amountField: "approved_amount", amountLabel: "Approved", insight: m.insights.approved })} />
          <KpiTile label="Collections (Settled)" value={formatInr(m.settled)} caption={`${m.settledClaimsCount} claims settled`} accent="success"
            onClick={() => openDrill({ title: "Settled claims (Collections)", subtitle: `${formatInr(m.settled)} collected across ${m.settledClaimsCount} claims`, claims: claims.filter(c => SETTLED.has((c.claim_status||"").toLowerCase())), amountField: "settled_amount", amountLabel: "Settled", insight: m.insights.settled })} />
          <KpiTile label="Live AR Portfolio" value={formatInr(m.liveAR)} caption={`${claims.filter(c => !SETTLED.has((c.claim_status||"").toLowerCase()) && c.date_of_discharge).length} open claims · approved basis`} accent="danger"
            onClick={() => openDrill({ title: "Live AR portfolio", subtitle: `Open claims (post-discharge) · ${formatInr(m.liveAR)} outstanding`, claims: claims.filter(c => isOpen(c.claim_status) && c.date_of_discharge), amountField: "outstanding_amount", amountLabel: "Outstanding", insight: m.insights.liveAR })} />
          <KpiTile label="Net Collection Rate (NCR)" value={`${m.ncr.toFixed(1)}%`} caption="settled ÷ approved (standard)" accent="success"
            onClick={() => openDrill({ title: "NCR — Approved claims (settled vs approved)", subtitle: `${formatInr(m.settled)} settled ÷ ${formatInr(m.approved)} approved = ${m.ncr.toFixed(1)}%`, claims: claims.filter(c => c.approved_amount > 0), amountField: "settled_amount", amountLabel: "Settled", insight: m.insights.ncr })} />
          <KpiTile label="Days in AR (DIAR)" value={`${Math.round(m.diar)}d`} caption={`avg across ${claims.filter(c => !SETTLED.has((c.claim_status||"").toLowerCase())).length} open claims`} accent="muted"
            onClick={() => openDrill({ title: "Open claims contributing to DIAR", subtitle: `${formatInr(m.openOutstanding)} open ÷ ${formatInr(m.dailyRevRun)}/day = ${Math.round(m.diar)}d`, claims: claims.filter(c => isOpen(c.claim_status)), amountField: "outstanding_amount", amountLabel: "Outstanding", insight: m.insights.diar })} />
        </div>

        {/* KPI grid - row 2 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiTile label="Claim Velocity" value={`${m.avgAtp.toFixed(1)}/d`} caption={`${m.total} claims over ${Math.round(m.avgAtp * m.total)} days`} accent="default"
            onClick={() => openDrill({ title: "Claims with payment timing data", subtitle: `Avg approval-to-payment ${m.avgAtp.toFixed(1)} days`, claims: claims.filter(c => c.payment_update_date && c.claim_creation_date), amountField: "settled_amount", amountLabel: "Settled", insight: m.insights.velocity })} />
          <KpiTile label="90+ Day SLA Risk" value={`${m.irdaiRisk}`} caption={`${m.irdaiRisk > 0 ? formatInr(m.buckets["91-180"] + m.buckets["180+"]) : "₹0"} at risk`} accent={m.irdaiRisk > 0 ? "danger" : "muted"}
            onClick={() => openDrill({ title: "SLA 90+ day breaches", subtitle: `${m.irdaiRisk} claims breached · ${formatInr(m.arOver90)} at risk`, claims: claims.filter(c => c.is_irdai_breach), amountField: "outstanding_amount", amountLabel: "Outstanding", insight: m.insights.irdai })} />
          <KpiTile label="Denial Rate" value={`${m.denialRate.toFixed(1)}%`} caption={`${m.denials.length} denied claims`} accent="warn"
            onClick={() => openDrill({ title: "Denied / rejected claims", subtitle: `${m.denials.length} denials of ${m.total} (${m.denialRate.toFixed(1)}%) · ${formatInr(m.denialAmt)} claimed`, claims: m.denials, amountField: "claimed_amount", amountLabel: "Claimed", insight: m.insights.denialRate })} />
          <KpiTile label="Underpayment Rate %" value={`${m.underpayRate.toFixed(1)}%`} caption={`${formatInr(m.underpayments)} gap · ${m.underpayClaims.length} claims`} accent="warn"
            onClick={() => openDrill({ title: "Underpaid claims (Discrepancy Tracker formula)", subtitle: `${m.underpayClaims.length} settled claims · ${formatInr(m.underpayments)} short-paid (${m.underpayRate.toFixed(1)}% of approved)`, claims: m.underpayClaims, amountField: "approved_amount", amountLabel: "Approved", insight: m.insights.underpay })} />
          <KpiTile label="Active (Pre-Discharge)" value={formatInr(m.activeAmt)} caption={`${m.activeInHospital} claims · not in AR`} accent="info"
            onClick={() => openDrill({ title: "Active claims (in-hospital)", subtitle: `${m.activeInHospital} patients · ${formatInr(m.activeAmt)} expected`, claims: claims.filter(c => !c.date_of_discharge), amountField: "claimed_amount", amountLabel: "Claimed", insight: m.insights.active })} />
          <KpiTile label="Docs Not Submitted" value={`${m.docsNotSubmitted}`} caption={`${formatInr(m.docsNotSubmittedAmt)} pending submission`} accent="warn"
            onClick={() => openDrill({ title: "Docs not submitted", subtitle: `${m.docsNotSubmitted} claims · ${formatInr(m.docsNotSubmittedAmt)}`, claims: claims.filter(c => SUBMITTED_NEGATIVE.has((c.claim_status||"").toLowerCase())), amountField: "claimed_amount", amountLabel: "Claimed", insight: m.insights.docsNotSubmitted })} />
        </div>

        {/* AR by Status + Top TPA */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionCard title="AR By Status" right={<span className="text-[10px] text-muted-foreground">Click slice to drill</span>}>
            <div className="h-72">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={m.statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={1}
                    onClick={(d: { name?: string }) => {
                      const name = d?.name;
                      if (!name) return;
                      const subset = claims.filter((c) => {
                        const k = (c.claim_status || "").toLowerCase();
                        if (name === "Settled") return SETTLED.has(k);
                        if (name === "Denied") return DENIED.has(k);
                        if (name === "Under Query") return k.includes("query");
                        return !SETTLED.has(k) && !DENIED.has(k) && !k.includes("query");
                      });
                      openDrill({ title: `${name} claims`, subtitle: `${subset.length} claims`, claims: subset });
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {m.statusData.map((d) => (
                      <Cell key={d.name} fill={STATUS_COLORS[d.name] || "hsl(var(--muted))"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString("en-IN")} />
                  <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard title="Top 8 TPA — Outstanding" right={<span className="text-[10px] text-muted-foreground">Click bar to drill</span>}>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={m.topTpa} margin={{ top: 5, right: 10, left: 0, bottom: 50 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9 }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatInr(v)} />
                  <Tooltip formatter={(v: number) => formatInr(v)} />
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--foreground))"
                    radius={[2, 2, 0, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(d: { name?: string }) => {
                      const tpa = d?.name;
                      if (!tpa) return;
                      const subset = claims.filter((c) => c.tpa_name === tpa && isOpen(c.claim_status));
                      openDrill({ title: `${tpa} — Outstanding`, subtitle: `${subset.length} open claims`, claims: subset, amountField: "outstanding_amount", amountLabel: "Outstanding" });
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>

        {/* Aging + Department */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SectionCard title="Aging Buckets" right={<span className="text-[10px] text-muted-foreground">Click bar to drill</span>}>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={Object.entries(m.buckets).map(([name, value]) => ({ name, value }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatInr(v)} />
                  <Tooltip formatter={(v: number) => formatInr(v)} />
                  <Bar
                    dataKey="value"
                    fill="hsl(160 70% 38%)"
                    radius={[3, 3, 0, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(d: { name?: string }) => {
                      const bucket = d?.name;
                      if (!bucket) return;
                      const inBucket = (days: number) => {
                        if (bucket === "0-30") return days <= 30;
                        if (bucket === "31-60") return days > 30 && days <= 60;
                        if (bucket === "61-90") return days > 60 && days <= 90;
                        if (bucket === "91-180") return days > 90 && days <= 180;
                        return days > 180;
                      };
                      const subset = claims.filter((c) => isOpen(c.claim_status) && inBucket(ageDays(c.claim_creation_date)));
                      openDrill({ title: `Aging — ${bucket} days`, subtitle: `${subset.length} open claims`, claims: subset, amountField: "outstanding_amount", amountLabel: "Outstanding" });
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          <SectionCard title="Department-wise Claims" right={<span className="text-[10px] text-muted-foreground">Click bar to drill</span>}>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={m.deptData} layout="vertical" margin={{ left: 60 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    fill="hsl(0 75% 55%)"
                    radius={[0, 3, 3, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(d: { name?: string }) => {
                      const dept = d?.name;
                      if (!dept) return;
                      const subset = claims.filter((c) => inferDept(c) === dept);
                      openDrill({ title: `${dept} — Claims`, subtitle: `${subset.length} claims`, claims: subset, amountField: "claimed_amount", amountLabel: "Claimed" });
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>

        {/* Revenue Funnel */}
        <SectionCard
          title="Claim Revenue Funnel"
          right={<span className="text-[11px] text-muted-foreground">Click any row to drill</span>}
        >
          <div>
            <FunnelRow label="Total Claimed" count={m.total} amount={m.claimed} pct={100} barColor="hsl(217 30% 60%)"
              onClick={() => openDrill({ title: "Funnel · Total Claimed", subtitle: `${m.total} claims · ${formatInr(m.claimed)}`, claims, amountField: "claimed_amount", amountLabel: "Claimed" })} />
            <FunnelRow label="Submitted" count={m.submitted} amount={m.submittedAmt} pct={m.claimed > 0 ? (m.submittedAmt / m.claimed) * 100 : 0} barColor="hsl(217 70% 70%)"
              onClick={() => openDrill({ title: "Funnel · Submitted claims", subtitle: `${m.submitted} submitted · ${formatInr(m.submittedAmt)}`, claims: claims.filter(c => !SUBMITTED_NEGATIVE.has((c.claim_status||"").toLowerCase())), amountField: "claimed_amount", amountLabel: "Claimed" })} />
            <FunnelRow label="Approved" count={claims.filter(c => c.approved_amount > 0).length} amount={m.approved} pct={m.claimed > 0 ? (m.approved / m.claimed) * 100 : 0} barColor="hsl(38 92% 70%)" delta={m.claimed > 0 ? `↓${(((m.claimed - m.approved) / m.claimed) * 100).toFixed(1)}%` : ""}
              onClick={() => openDrill({ title: "Funnel · Approved claims", subtitle: `${claims.filter(c => c.approved_amount > 0).length} approved · ${formatInr(m.approved)}`, claims: claims.filter(c => c.approved_amount > 0), amountField: "approved_amount", amountLabel: "Approved" })} />
            <FunnelRow label="Collected" count={m.settledClaimsCount} amount={m.settled} pct={m.claimed > 0 ? (m.settled / m.claimed) * 100 : 0} barColor="hsl(160 70% 60%)" delta={m.approved > 0 ? `↓${(((m.approved - m.settled) / m.approved) * 100).toFixed(1)}%` : ""}
              onClick={() => openDrill({ title: "Funnel · Collected (Settled)", subtitle: `${m.settledClaimsCount} settled · ${formatInr(m.settled)}`, claims: claims.filter(c => SETTLED.has((c.claim_status||"").toLowerCase())), amountField: "settled_amount", amountLabel: "Settled" })} />
          </div>
        </SectionCard>

        {/* Aging detail + Leakage */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile label="0-30 Days AR" value={formatInr(m.buckets["0-30"])} caption={`${m.bucketCounts["0-30"]} claims · ${m.openOutstanding > 0 ? ((m.buckets["0-30"]/m.openOutstanding)*100).toFixed(0) : 0}% of AR`} accent="success"
            onClick={() => openDrill({ title: "Aging · 0–30 days", subtitle: `${m.bucketCounts["0-30"]} open claims · ${formatInr(m.buckets["0-30"])}`, claims: claims.filter(c => isOpen(c.claim_status) && ageDays(c.claim_creation_date) <= 30), amountField: "outstanding_amount", amountLabel: "Outstanding" })} />
          <KpiTile label="31-60 Days AR" value={formatInr(m.buckets["31-60"])} caption={`${m.bucketCounts["31-60"]} claims · ${m.openOutstanding > 0 ? ((m.buckets["31-60"]/m.openOutstanding)*100).toFixed(0) : 0}% of AR`} accent="warn"
            onClick={() => openDrill({ title: "Aging · 31–60 days", subtitle: `${m.bucketCounts["31-60"]} open claims · ${formatInr(m.buckets["31-60"])}`, claims: claims.filter(c => { const d = ageDays(c.claim_creation_date); return isOpen(c.claim_status) && d > 30 && d <= 60; }), amountField: "outstanding_amount", amountLabel: "Outstanding" })} />
          <KpiTile label="61-90 Days AR" value={formatInr(m.buckets["61-90"])} caption={`${m.bucketCounts["61-90"]} claims · ${m.openOutstanding > 0 ? ((m.buckets["61-90"]/m.openOutstanding)*100).toFixed(0) : 0}% of AR`} accent="warn"
            onClick={() => openDrill({ title: "Aging · 61–90 days", subtitle: `${m.bucketCounts["61-90"]} open claims · ${formatInr(m.buckets["61-90"])}`, claims: claims.filter(c => { const d = ageDays(c.claim_creation_date); return isOpen(c.claim_status) && d > 60 && d <= 90; }), amountField: "outstanding_amount", amountLabel: "Outstanding" })} />
          <KpiTile label="90+ Days (SLA)" value={formatInr(m.arOver90)} caption={`${m.bucketCounts["91-180"] + m.bucketCounts["180+"]} claims · ${m.openOutstanding > 0 ? ((m.arOver90/m.openOutstanding)*100).toFixed(0) : 0}% of AR`} accent="danger"
            onClick={() => openDrill({ title: "Aging · 90+ days (SLA risk)", subtitle: `${m.bucketCounts["91-180"] + m.bucketCounts["180+"]} open claims · ${formatInr(m.arOver90)}`, claims: claims.filter(c => isOpen(c.claim_status) && ageDays(c.claim_creation_date) > 90), amountField: "outstanding_amount", amountLabel: "Outstanding" })} />
          <Card className="bg-zinc-900 text-zinc-100 border-zinc-800 shadow-none">
            <CardContent className="p-3.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                <Flame className="h-3 w-3" /> Revenue Leakage
              </div>
              <div className="mt-2 space-y-1 text-[12px]">
                <div className="flex justify-between"><span>Denials</span><span className="font-semibold text-rose-400">{formatInr(m.denialAmt)}</span></div>
                <div className="flex justify-between"><span>Underpayments</span><span className="font-semibold text-amber-400">{formatInr(m.underpayments)}</span></div>
                <div className="flex justify-between"><span>Unsubmitted</span><span className="font-semibold text-sky-400">{formatInr(m.unsubmitted)}</span></div>
                <div className="flex justify-between border-t border-zinc-700 pt-1 mt-1"><span className="font-semibold">Total Leakage</span><span className="font-bold">{formatInr(totalLeakage)}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* TAT + CCR + Denial Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SectionCard title="Turnaround Time (TAT)">
            <div className="space-y-2">
              {[
                { l: "Discharge → Submission", s: "Hospital Submission Lag", v: `${m.avgDts.toFixed(1)}d` },
                { l: "Submission → Approval", s: "TPA Processing Lag", v: "—" },
                { l: "Approval → Payment", s: "TPA Settlement Lag", v: `${m.avgAtp.toFixed(1)}d` },
              ].map((row) => (
                <div key={row.l} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                  <div>
                    <div className="text-[12px] font-medium">{row.l}</div>
                    <div className="text-[10px] text-muted-foreground">{row.s}</div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">{row.v}<span className="text-[10px] text-muted-foreground ml-1">avg days</span></div>
                </div>
              ))}
              {m.breached48h > 0 && (
                <div className="text-[11px] text-rose-600 mt-1">
                  {m.breached48h} claims breached 48-hr submission window
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Clean Claim Rate (CCR)" right={<span className="text-[10px] text-muted-foreground">formerly FPY</span>}>
            <div className="text-center py-4">
              <div className="text-5xl font-bold text-emerald-600 tabular-nums">{m.ccr.toFixed(1)}%</div>
              <div className="text-[11px] text-muted-foreground mt-2">First-time approvals ÷ Total submitted</div>
              <div className="text-[10px] text-muted-foreground">
                {(m.submitted - m.denials.length).toLocaleString("en-IN")} clean / {m.submitted.toLocaleString("en-IN")} total submissions
              </div>
              <div className="mt-3 space-y-0.5 text-left text-[11px] text-muted-foreground">
                <div>🔴 FPY &lt; 70% → Rework high. Review docs checklist.</div>
                <div>🟡 FPY 70-85% → Acceptable. Target improvement.</div>
                <div>🟢 FPY &gt; 85% → Excellent. Maintain process.</div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Denial Metrics">
            <div className="space-y-2">
              <div className="flex justify-between rounded-md bg-rose-500/10 px-3 py-2 text-[12px]"><span>Denial Amount</span><span className="font-semibold tabular-nums">{formatInr(m.denialAmt)}</span></div>
              <div className="flex justify-between rounded-md bg-amber-500/10 px-3 py-2 text-[12px]"><span>Denial Rate</span><span className="font-semibold tabular-nums">{m.denialRate.toFixed(1)}%</span></div>
              <div className="flex justify-between rounded-md bg-emerald-500/10 px-3 py-2 text-[12px]"><span>Recovery %</span><span className="font-semibold tabular-nums">0%</span></div>
              <div className="flex justify-between rounded-md bg-sky-500/10 px-3 py-2 text-[12px]"><span>Appeal Success</span><span className="font-semibold tabular-nums">—</span></div>
            </div>
          </SectionCard>
        </div>

        {/* Auto-flag alerts */}
        {m.breached48h > 0 && (
          <SectionCard title="Auto-Flag Alerts">
            <div className="rounded-md bg-rose-500/10 border border-rose-500/30 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-[13px] font-medium text-rose-700 dark:text-rose-300">
                    {m.breached48h} claim(s) submitted after 48-hour window
                  </div>
                  <div className="text-[11px] text-rose-700/70 dark:text-rose-300/70 mt-0.5">
                    Discharge-to-submission avg {m.avgDts.toFixed(1)} days. Insurer may reject on timing grounds.
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {/* MIS / AR segmentation */}
        <SectionCard title="MIS Quick Insights — AR Segmentation" right={<a href="/claims" className="text-[11px] text-primary hover:underline">View All Claims →</a>}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <button
              type="button"
              onClick={() => openDrill({ title: "High-value AR (> ₹5L outstanding)", subtitle: `${m.high.length} claims · ${formatInr(m.high.reduce((s,c)=>s+c.outstanding_amount,0))}`, claims: m.high, amountField: "outstanding_amount", amountLabel: "Outstanding" })}
              className="text-left rounded-md border-l-2 border-rose-500 bg-card p-3 hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400"
            >
              <div className="text-[11px] uppercase font-semibold text-muted-foreground">🔴 High Value AR ( &gt;5L )</div>
              <div className="mt-1 text-2xl font-bold text-rose-600 tabular-nums">{formatInr(m.high.reduce((s,c) => s + c.outstanding_amount, 0))}</div>
              <div className="text-[11px] text-muted-foreground">{m.high.length} claims · click to view</div>
            </button>
            <button
              type="button"
              onClick={() => openDrill({ title: "Mid-value AR (₹1L–₹5L outstanding)", subtitle: `${m.mid.length} claims · ${formatInr(m.mid.reduce((s,c)=>s+c.outstanding_amount,0))}`, claims: m.mid, amountField: "outstanding_amount", amountLabel: "Outstanding" })}
              className="text-left rounded-md border-l-2 border-amber-500 bg-card p-3 hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <div className="text-[11px] uppercase font-semibold text-muted-foreground">🟡 Mid Value AR (1–5L)</div>
              <div className="mt-1 text-2xl font-bold text-amber-600 tabular-nums">{formatInr(m.mid.reduce((s,c) => s + c.outstanding_amount, 0))}</div>
              <div className="text-[11px] text-muted-foreground">{m.mid.length} claims · click to view</div>
            </button>
            <button
              type="button"
              onClick={() => openDrill({ title: "Low-value AR (< ₹1L outstanding)", subtitle: `${m.low.length} claims · ${formatInr(m.low.reduce((s,c)=>s+c.outstanding_amount,0))}`, claims: m.low, amountField: "outstanding_amount", amountLabel: "Outstanding" })}
              className="text-left rounded-md border-l-2 border-emerald-500 bg-card p-3 hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              <div className="text-[11px] uppercase font-semibold text-muted-foreground">🟢 Low Value AR (&lt;1L)</div>
              <div className="mt-1 text-2xl font-bold text-emerald-600 tabular-nums">{formatInr(m.low.reduce((s,c) => s + c.outstanding_amount, 0))}</div>
              <div className="text-[11px] text-muted-foreground">{m.low.length} claims · click to view</div>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Top Denial Reasons</div>
              <div className="space-y-1">
                {m.topDenialReasons.map(([reason, count]) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => openDrill({ title: `Denials · ${reason}`, subtitle: `${count} denied claims with this reason`, claims: m.denials.filter(c => ((c.insurer_comments || "Unspecified").split(/[.,;\n]/)[0].trim().slice(0, 50) || "Unspecified") === reason), amountField: "claimed_amount", amountLabel: "Claimed" })}
                    className="w-full flex items-center justify-between rounded-md bg-rose-500/10 hover:bg-rose-500/20 px-3 py-2 text-[12px] transition-colors text-left"
                  >
                    <span className="truncate">{reason}</span>
                    <span className="font-semibold text-rose-600 ml-2 shrink-0">{count} claims ›</span>
                  </button>
                ))}
                {m.topDenialReasons.length === 0 && <div className="text-[11px] text-muted-foreground">No denials</div>}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Top 5 TPA — AR Outstanding</div>
              <div className="space-y-1">
                {m.top5Tpa.map((tpa) => {
                  const max = m.top5Tpa[0]?.value || 1;
                  return (
                    <button
                      key={tpa.name}
                      type="button"
                      onClick={() => openDrill({ title: `${tpa.name} — Outstanding`, subtitle: `Open claims with this TPA · ${formatInr(tpa.value)}`, claims: claims.filter(c => c.tpa_name === tpa.name && isOpen(c.claim_status)), amountField: "outstanding_amount", amountLabel: "Outstanding" })}
                      className="w-full text-[12px] hover:bg-muted/40 rounded px-2 py-1 -mx-2 transition-colors text-left"
                    >
                      <div className="flex justify-between">
                        <span className="truncate">{tpa.name}</span>
                        <span className="font-semibold tabular-nums ml-2">{formatInr(tpa.value)}</span>
                      </div>
                      <div className="h-1 mt-0.5 bg-muted/40 rounded">
                        <div className="h-full bg-rose-500 rounded" style={{ width: `${(tpa.value / max) * 100}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Workflow status */}
        <SectionCard
          title="Claim Workflow Status — Live"
          right={
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700">● Auto-saved (live)</span>
            </div>
          }
        >
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { l: "Active Claims", v: claims.filter(c => !SETTLED.has((c.claim_status||"").toLowerCase()) && !DENIED.has((c.claim_status||"").toLowerCase())).length, c: "Patient journey ongoing", color: "text-emerald-600", dot: "bg-emerald-500", subset: claims.filter(c => !SETTLED.has((c.claim_status||"").toLowerCase()) && !DENIED.has((c.claim_status||"").toLowerCase())), title: "Active claims" },
              { l: "Docs Pending", v: m.docsPending, c: "Hospital action needed", color: "text-amber-600", dot: "bg-amber-500", subset: claims.filter((c) => /docs?\s*pending|enhancement requested/i.test(c.claim_status || "")), title: "Docs pending" },
              { l: "Under Process", v: m.underProcess, c: "Insurance reviewing", color: "text-sky-600", dot: "bg-sky-500", subset: claims.filter((c) => /process|enhancement approved|pre auth approved|claim approved/i.test(c.claim_status || "")), title: "Under process (insurer reviewing)" },
              { l: "Denied / Cancelled", v: m.denials.length, c: "Action / appeal needed", color: "text-rose-600", dot: "bg-rose-500", subset: m.denials, title: "Denied / cancelled" },
              { l: "Settled", v: m.settledClaimsCount, c: "Payment received", color: "text-emerald-600", dot: "bg-emerald-500", subset: claims.filter(c => SETTLED.has((c.claim_status||"").toLowerCase())), title: "Settled claims" },
              { l: "Avg TAT", v: `${m.avgAtp.toFixed(0)}d`, c: `${m.irdaiRisk} SLA breaches`, color: "text-sky-600", dot: "bg-sky-500", subset: claims.filter(c => c.is_irdai_breach), title: "SLA breach claims" },
            ].map((s) => (
              <button
                key={s.l}
                type="button"
                onClick={() => openDrill({ title: s.title, subtitle: `${s.subset.length} claims`, claims: s.subset, amountField: "outstanding_amount", amountLabel: "Outstanding" })}
                className="text-left rounded-md border bg-card p-3 hover:bg-muted/40 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {s.l}
                </div>
                <div className={`mt-1 text-2xl font-bold tabular-nums ${s.color}`}>{typeof s.v === "number" ? s.v.toLocaleString("en-IN") : s.v}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.c}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 rounded-md bg-muted/30 px-3 py-2">
            <div className="text-[11px] flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> <span className="text-muted-foreground">Live AR Outstanding</span> <span className="ml-auto font-semibold">{formatInr(m.liveAR)}</span></div>
            <div className="text-[11px] flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> <span className="text-muted-foreground">Active (In-Hospital)</span> <span className="ml-auto font-semibold">{formatInr(m.activeAmt)}</span></div>
            <div className="text-[11px] flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> <span className="text-muted-foreground">Docs Not Submitted</span> <span className="ml-auto font-semibold">{formatInr(m.docsNotSubmittedAmt)}</span></div>
          </div>
        </SectionCard>

        <div className="text-center text-[10px] text-muted-foreground py-4">
          <FileWarning className="h-3 w-3 inline mr-1" /> Executive Dashboard · Live data refreshes on reload · Click any tile, bar or row to verify the underlying claims
        </div>
        </>)}
        </div>
      </div>


      <ExecutiveDrillDownDrawer
        open={!!drill}
        onOpenChange={(o) => { if (!o) setDrill(null); }}
        title={drill?.title ?? ""}
        subtitle={drill?.subtitle}
        claims={drill?.claims ?? []}
        amountField={drill?.amountField}
        amountLabel={drill?.amountLabel}
        insight={drill?.insight}
      />

      <PdfExportDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        sourceRef={exportRef}
        title="Executive Dashboard"
        fileName={`RCMBuddy-Executive-Dashboard-${new Date().toISOString().slice(0, 10)}.pdf`}
        meta={{
          dateFrom: filterFrom,
          dateTo: filterTo,
          groups: groupIds,
          branches: branchIds,
          modules: ["Claims"],
          role: role ?? undefined,
          snapshotFrom: snapshotRange.min,
          snapshotTo: snapshotRange.max,
          totalClaims: m.total,
        }}
      />
    </AppLayout>
  );
}
