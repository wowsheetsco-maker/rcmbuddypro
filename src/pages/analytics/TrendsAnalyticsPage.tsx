import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp, Loader2, Download, BarChart3, Building2, Stethoscope,
  XCircle, ListChecks, Activity, ArrowUpRight, ArrowDownRight,
  CalendarRange, FilterX, X,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend,
  Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatInr, formatInrShort } from "@/data/mockClaims";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import {
  buildMonthlySeries, buildInsurerTrend, buildDepartmentTrend, buildDenialTrend,
  buildTrendsKpis, classifyDepartment, type MonthlyPoint, type Department,
} from "@/lib/trendsAnalytics";
import InsurerDrillDownDrawer from "@/components/InsurerDrillDownDrawer";

const DEPARTMENTS: Department[] = [
  "Cardiology", "Orthopaedics", "Oncology", "Neurology", "Nephrology",
  "Urology", "Gastroenterology", "Gynaecology", "Paediatrics", "ENT",
  "Ophthalmology", "Pulmonology", "General Medicine", "General Surgery",
  "Other / Unspecified",
];

const COLORS = {
  billed: "hsl(var(--foreground))",
  settled: "hsl(var(--success))",
  approved: "hsl(var(--primary))",
  outstanding: "hsl(var(--destructive))",
  ncr: "hsl(var(--warning))",
  denial: "hsl(var(--destructive))",
};

const PIE_PALETTE = [
  "hsl(var(--destructive))",
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--accent-foreground))",
  "hsl(220 60% 50%)",
  "hsl(280 50% 55%)",
  "hsl(340 60% 55%)",
  "hsl(180 50% 45%)",
  "hsl(40 80% 50%)",
];

type Tab = "monthly" | "insurer" | "department" | "denial" | "volume" | "ncr";

const FILTER_STORAGE_KEY = "rcm-buddy-trends-filters";

interface PersistedFilters {
  fromDate: string;
  toDate: string;
  deptFilter: Department | "all";
  insurerDim: "insurer" | "tpa";
  overviewMetric: "settled-vs-ar" | "billed-vs-settled" | "approval";
}

function loadPersistedFilters(): Partial<PersistedFilters> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function TrendsAnalyticsPage() {
  const { claims, loading, isMock } = useLiveClaims();
  const [tab, setTab] = useState<Tab>("monthly");

  const persisted = useMemo(() => loadPersistedFilters(), []);

  const [insurerDim, setInsurerDim] = useState<"insurer" | "tpa">(persisted.insurerDim ?? "insurer");
  const [overviewMetric, setOverviewMetric] = useState<"settled-vs-ar" | "billed-vs-settled" | "approval">(
    persisted.overviewMetric ?? "billed-vs-settled",
  );

  // Filters
  const [fromDate, setFromDate] = useState<string>(persisted.fromDate ?? "");
  const [toDate, setToDate] = useState<string>(persisted.toDate ?? "");
  const [deptFilter, setDeptFilter] = useState<Department | "all">(persisted.deptFilter ?? "all");

  // Persist filter selections so they survive tab switches and revisits
  useEffect(() => {
    const payload: PersistedFilters = { fromDate, toDate, deptFilter, insurerDim, overviewMetric };
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota errors */
    }
  }, [fromDate, toDate, deptFilter, insurerDim, overviewMetric]);

  // Drill-down drawer
  const [drillName, setDrillName] = useState<string | null>(null);

  const filteredClaims = useMemo(() => {
    const fromMs = fromDate ? new Date(fromDate).getTime() : null;
    const toMs = toDate ? new Date(toDate).getTime() + 86_400_000 - 1 : null;
    return claims.filter((c) => {
      if (fromMs || toMs) {
        const t = c.claim_creation_date ? new Date(c.claim_creation_date).getTime() : NaN;
        if (Number.isNaN(t)) return false;
        if (fromMs && t < fromMs) return false;
        if (toMs && t > toMs) return false;
      }
      if (deptFilter !== "all") {
        if (classifyDepartment(c.treatment, c.diagnosis) !== deptFilter) return false;
      }
      return true;
    });
  }, [claims, fromDate, toDate, deptFilter]);

  const monthly = useMemo(() => buildMonthlySeries(filteredClaims), [filteredClaims]);
  const insurerTrend = useMemo(() => buildInsurerTrend(filteredClaims, insurerDim), [filteredClaims, insurerDim]);
  const deptTrend = useMemo(() => buildDepartmentTrend(filteredClaims), [filteredClaims]);
  const denialTrend = useMemo(() => buildDenialTrend(filteredClaims), [filteredClaims]);
  const kpis = useMemo(() => buildTrendsKpis(filteredClaims, monthly), [filteredClaims, monthly]);

  const filtersActive = !!(fromDate || toDate || deptFilter !== "all");
  const tabSelectionsActive = insurerDim !== "insurer" || overviewMetric !== "billed-vs-settled";
  const anyActive = filtersActive || tabSelectionsActive;

  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setDeptFilter("all");
    setInsurerDim("insurer");
    setOverviewMetric("billed-vs-settled");
  };

  const formatDateLabel = (s: string) => {
    if (!s) return "";
    const d = new Date(s);
    return Number.isNaN(d.getTime())
      ? s
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const handleExport = () => {
    const head = ["Month", "Claims", "Billed", "Approved", "Settled", "Outstanding", "NCR %", "Approval %", "Denial %", "MoM Growth %"];
    const body = monthly.map((m) => [
      m.label, m.claims, Math.round(m.billed), Math.round(m.approved),
      Math.round(m.settled), Math.round(m.outstanding), m.ncrPct, m.approvalPct, m.denialPct, m.growthPct,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [head.join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trends-monthly-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Trends &amp; Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
              All-month trends — monthly, insurer-wise, department-wise, and denial analysis.
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {isMock && !loading && (
                <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!monthly.length}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export Monthly CSV
          </Button>
        </div>

        {/* Filter toolbar — applied to ALL tabs */}
        <Card className="p-3 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-2">
              <CalendarRange className="h-3.5 w-3.5" />
              Period &amp; segment
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="trend-from" className="text-[10px] uppercase tracking-wider text-muted-foreground">From</Label>
              <Input
                id="trend-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                max={toDate || undefined}
                className="h-8 text-xs w-[150px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="trend-to" className="text-[10px] uppercase tracking-wider text-muted-foreground">To</Label>
              <Input
                id="trend-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate || undefined}
                className="h-8 text-xs w-[150px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Department</Label>
              <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v as Department | "all")}>
                <SelectTrigger className="h-8 text-xs w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All departments</SelectItem>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[10px] text-muted-foreground">
                {filteredClaims.length} of {claims.length} claims
              </span>
              {anyActive && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-[11px]">
                  <FilterX className="h-3 w-3 mr-1" />
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Active filter chips */}
        {anyActive && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Applied:
            </span>
            {(fromDate || toDate) && (
              <FilterChip
                label={`Period: ${fromDate ? formatDateLabel(fromDate) : "Start"} → ${toDate ? formatDateLabel(toDate) : "Today"}`}
                onClear={() => { setFromDate(""); setToDate(""); }}
              />
            )}
            {deptFilter !== "all" && (
              <FilterChip
                label={`Dept: ${deptFilter}`}
                onClear={() => setDeptFilter("all")}
              />
            )}
            {insurerDim !== "insurer" && (
              <FilterChip
                label="View: TPA-wise"
                onClear={() => setInsurerDim("insurer")}
              />
            )}
            {overviewMetric !== "billed-vs-settled" && (
              <FilterChip
                label={`Metric: ${overviewMetric === "settled-vs-ar" ? "Settled vs AR" : "Approval %"}`}
                onClear={() => setOverviewMetric("billed-vs-settled")}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
            >
              Reset all
            </Button>
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Months Tracked" value={kpis.monthsTracked.toString()} sub="of claim activity" />
          <KpiCard label="Total Billed" value={formatInrShort(kpis.totalBilled)} />
          <KpiCard label="Total Settled" value={formatInrShort(kpis.totalSettled)} tone="success" />
          <KpiCard
            label="Avg NCR"
            value={`${kpis.avgNcrPct}%`}
            tone={kpis.avgNcrPct >= 70 ? "success" : kpis.avgNcrPct >= 50 ? "warning" : "destructive"}
          />
          <KpiCard
            label="Denial Rate"
            value={`${kpis.denialRatePct}%`}
            tone={kpis.denialRatePct > 15 ? "destructive" : kpis.denialRatePct > 5 ? "warning" : "success"}
          />
          <KpiCard
            label="MoM Growth"
            value={`${kpis.momGrowthPct >= 0 ? "+" : ""}${kpis.momGrowthPct}%`}
            tone={kpis.momGrowthPct >= 0 ? "success" : "destructive"}
            sub={kpis.bestMonth ? `Peak: ${kpis.bestMonth.label}` : undefined}
            icon={kpis.momGrowthPct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          />
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="space-y-4">
          <Card className="p-1 shadow-sm overflow-x-auto">
            <TabsList className="bg-transparent gap-1 h-auto p-0">
              <TabTrigger value="monthly" icon={<BarChart3 className="h-3.5 w-3.5" />}>Monthly Overview</TabTrigger>
              <TabTrigger value="insurer" icon={<Building2 className="h-3.5 w-3.5" />}>Insurer-wise</TabTrigger>
              <TabTrigger value="department" icon={<Stethoscope className="h-3.5 w-3.5" />}>Department-wise</TabTrigger>
              <TabTrigger value="denial" icon={<XCircle className="h-3.5 w-3.5" />}>Denial Trend</TabTrigger>
              <TabTrigger value="volume" icon={<ListChecks className="h-3.5 w-3.5" />}>Claim Volume</TabTrigger>
              <TabTrigger value="ncr" icon={<Activity className="h-3.5 w-3.5" />}>NCR Trend</TabTrigger>
            </TabsList>
          </Card>

          {/* ---------- Monthly Overview ---------- */}
          <TabsContent value="monthly" className="space-y-4 mt-0">
            <Card className="p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2">
                  Billed vs Settled vs AR Outstanding — All Months
                </h3>
                <Select value={overviewMetric} onValueChange={(v) => setOverviewMetric(v as typeof overviewMetric)}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="billed-vs-settled" className="text-xs">Billed vs Settled</SelectItem>
                    <SelectItem value="settled-vs-ar" className="text-xs">Settled vs AR</SelectItem>
                    <SelectItem value="approval" className="text-xs">Approval %</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  {overviewMetric === "approval" ? (
                    <LineChart data={monthly} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <RTooltip
                        contentStyle={tooltipStyle}
                        formatter={(v: number) => `${v}%`}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="approvalPct" name="Approval %" stroke={COLORS.approved} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="ncrPct" name="NCR %" stroke={COLORS.ncr} strokeWidth={2} dot={false} />
                    </LineChart>
                  ) : (
                    <AreaChart data={monthly} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
                      <defs>
                        <linearGradient id="settledFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.settled} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={COLORS.settled} stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="arFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.outstanding} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={COLORS.outstanding} stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="billedFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLORS.billed} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={COLORS.billed} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatInrShort(v)} />
                      <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => formatInr(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {overviewMetric === "billed-vs-settled" && (
                        <Area type="monotone" dataKey="billed" name="Billed" stroke={COLORS.billed} fill="url(#billedFill)" strokeWidth={1.5} />
                      )}
                      <Area type="monotone" dataKey="settled" name="Settled" stroke={COLORS.settled} fill="url(#settledFill)" strokeWidth={2} />
                      <Area type="monotone" dataKey="outstanding" name="AR Outstanding" stroke={COLORS.outstanding} fill="url(#arFill)" strokeWidth={2} />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Best/Worst month cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {monthly.slice(-4).map((m) => (
                <Card key={m.month} className="p-3 border-l-4 border-l-primary/40 shadow-sm">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</div>
                  <div className="text-base font-display tabular-nums mt-1">{formatInrShort(m.billed)}</div>
                  <div className="text-[10px] text-muted-foreground">Settled {formatInrShort(m.settled)}</div>
                  <div className={`text-[10px] mt-1 font-semibold ${m.ncrPct >= 70 ? "text-success" : m.ncrPct >= 50 ? "text-warning" : "text-destructive"}`}>
                    NCR {m.ncrPct}%
                  </div>
                </Card>
              ))}
            </div>

            {/* Bottom row: NCR + MoM growth */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <NcrTrendChart monthly={monthly} compact />
              <Card className="p-4 shadow-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2 mb-3">
                  Month-on-Month Collection Growth
                </h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                      <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                      <Bar dataKey="growthPct" name="MoM growth">
                        {monthly.map((m, i) => (
                          <Cell key={i} fill={m.growthPct >= 0 ? COLORS.settled : COLORS.outstanding} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* ---------- Insurer-wise ---------- */}
          <TabsContent value="insurer" className="space-y-4 mt-0">
            <Card className="p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2">
                  {insurerDim === "insurer" ? "Insurer" : "TPA"}-wise Performance — Top 10 by billed
                </h3>
                <Select value={insurerDim} onValueChange={(v) => setInsurerDim(v as "insurer" | "tpa")}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="insurer" className="text-xs">By Insurer</SelectItem>
                    <SelectItem value="tpa" className="text-xs">By TPA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={insurerTrend.slice(0, 10).map((r) => ({
                      ...r,
                      shortName: r.name.length > 18 ? r.name.slice(0, 18) + "…" : r.name,
                    }))}
                    margin={{ top: 5, right: 20, bottom: 60, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="shortName" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => formatInrShort(v)} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <RTooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number, name: string) =>
                        name === "NCR %" ? `${v}%` : formatInr(v)
                      }
                      labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ""}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="billed" name="Billed" fill={COLORS.billed} />
                    <Bar yAxisId="left" dataKey="settled" name="Settled" fill={COLORS.settled} />
                    <Bar yAxisId="left" dataKey="outstanding" name="Outstanding" fill={COLORS.outstanding} />
                    <Line yAxisId="right" type="monotone" dataKey="ncrPct" name="NCR %" stroke={COLORS.ncr} strokeWidth={2} dot />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <SegmentTable
              title={`${insurerDim === "insurer" ? "Insurer" : "TPA"} Performance Matrix`}
              firstColLabel={insurerDim === "insurer" ? "Insurer" : "TPA"}
              rows={insurerTrend.slice(0, 25).map((r) => ({
                name: r.name, claims: r.claims, billed: r.billed, settled: r.settled,
                outstanding: r.outstanding, ncrPct: r.ncrPct, share: r.share,
              }))}
              onRowClick={(name) => setDrillName(name)}
              rowHint="Click a row to drill into monthly claims"
            />
          </TabsContent>

          {/* ---------- Department-wise ---------- */}
          <TabsContent value="department" className="space-y-4 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-4 shadow-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2 mb-3">
                  Billed by Department
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={deptTrend}
                      layout="vertical"
                      margin={{ top: 5, right: 30, bottom: 5, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatInrShort(v)} />
                      <YAxis type="category" dataKey="department" tick={{ fontSize: 10 }} width={130} interval={0} />
                      <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => formatInr(v)} />
                      <Bar dataKey="billed" radius={[0, 3, 3, 0]}>
                        {deptTrend.map((_, i) => (
                          <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-4 shadow-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2 mb-3">
                  NCR % by Department
                </h3>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptTrend} margin={{ top: 5, right: 10, bottom: 60, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="department" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
                      <Bar dataKey="ncrPct" name="NCR %">
                        {deptTrend.map((d, i) => (
                          <Cell
                            key={i}
                            fill={d.ncrPct >= 70 ? COLORS.settled : d.ncrPct >= 50 ? COLORS.ncr : COLORS.outstanding}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <SegmentTable
              title="Department Performance Matrix"
              firstColLabel="Department"
              rows={deptTrend.map((r) => ({
                name: r.department, claims: r.claims, billed: r.billed, settled: r.settled,
                outstanding: r.outstanding, ncrPct: r.ncrPct, share: r.share,
              }))}
            />
          </TabsContent>

          {/* ---------- Denial Trend ---------- */}
          <TabsContent value="denial" className="space-y-4 mt-0">
            <Card className="p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2 mb-3">
                Denial Rate &amp; Amount-at-Risk by Month
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={denialTrend} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => formatInrShort(v)} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <RTooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number, name: string) =>
                        name === "Denial rate" ? `${v}%` : name === "Denied claims" ? `${v}` : formatInr(v)
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="deniedAmount" name="Amount at risk" fill={COLORS.outstanding} />
                    <Line yAxisId="right" type="monotone" dataKey="denialRate" name="Denial rate" stroke={COLORS.denial} strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="deniedClaims" name="Denied claims" stroke={COLORS.ncr} strokeWidth={1.5} strokeDasharray="4 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          {/* ---------- Claim Volume ---------- */}
          <TabsContent value="volume" className="space-y-4 mt-0">
            <Card className="p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2 mb-3">
                Monthly Claim Volume
              </h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} />
                    <RTooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="claims" name="Total claims" fill={COLORS.approved} />
                    <Bar dataKey="denied" name="Denied" fill={COLORS.outstanding} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          {/* ---------- NCR Trend ---------- */}
          <TabsContent value="ncr" className="space-y-4 mt-0">
            <NcrTrendChart monthly={monthly} />
          </TabsContent>
        </Tabs>
      </div>

      <InsurerDrillDownDrawer
        insurerName={drillName}
        dimension={insurerDim}
        allClaims={filteredClaims}
        open={!!drillName}
        onOpenChange={(o) => { if (!o) setDrillName(null); }}
      />
    </AppLayout>
  );
}

/* ---------- helpers ---------- */

const tooltipStyle = {
  fontSize: 11,
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
};

function TabTrigger({
  value, icon, children,
}: { value: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 text-xs h-8 px-3"
    >
      {icon}
      {children}
    </TabsTrigger>
  );
}

function KpiCard({
  label, value, sub, tone = "default", icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "muted";
  icon?: React.ReactNode;
}) {
  const toneClasses: Record<string, string> = {
    default: "border-l-foreground/40",
    success: "border-l-success",
    warning: "border-l-warning",
    destructive: "border-l-destructive",
    muted: "border-l-muted-foreground/40",
  };
  const valueColor: Record<string, string> = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  };
  return (
    <Card className={`p-3 border-l-4 shadow-sm ${toneClasses[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-display tabular-nums mt-1 flex items-center gap-1 ${valueColor[tone]}`}>
        {value}
        {icon}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 pr-1 pl-2 py-1 text-[10px] font-medium">
      <span>{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${label}`}
        className="rounded-full p-0.5 hover:bg-background/60 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </Badge>
  );
}

function NcrTrendChart({ monthly, compact = false }: { monthly: MonthlyPoint[]; compact?: boolean }) {
  return (
    <Card className="p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2 mb-3">
        Monthly NCR % Trend
      </h3>
      <div className={compact ? "h-56" : "h-80"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={monthly} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="ncrPct" name="NCR %" stroke={COLORS.approved} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="approvalPct" name="Approval %" stroke={COLORS.ncr} strokeWidth={1.5} dot={{ r: 2 }} strokeDasharray="4 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

interface SegmentRow {
  name: string; claims: number; billed: number; settled: number;
  outstanding: number; ncrPct: number; share: number;
}

function SegmentTable({
  title, firstColLabel, rows, onRowClick, rowHint,
}: {
  title: string;
  firstColLabel: string;
  rows: SegmentRow[];
  onRowClick?: (name: string) => void;
  rowHint?: string;
}) {
  return (
    <Card className="shadow-sm overflow-hidden">
      <div className="border-b bg-muted/30 px-4 py-2.5 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2">
          {title}
        </h3>
        {rowHint && (
          <span className="text-[10px] text-muted-foreground">{rowHint}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              <th className="py-2.5 px-3 text-left">{firstColLabel}</th>
              <th className="py-2.5 px-3 text-right">Claims</th>
              <th className="py-2.5 px-3 text-right">Billed</th>
              <th className="py-2.5 px-3 text-right">Settled</th>
              <th className="py-2.5 px-3 text-right">Outstanding</th>
              <th className="py-2.5 px-3 text-right">NCR %</th>
              <th className="py-2.5 px-3 text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.name}
                onClick={onRowClick ? () => onRowClick(r.name) : undefined}
                className={`border-b last:border-0 hover:bg-muted/40 transition-colors ${
                  onRowClick ? "cursor-pointer" : ""
                }`}
              >
                <td className="py-2.5 px-3 font-medium text-foreground">
                  {onRowClick ? (
                    <span className="hover:text-primary transition-colors">{r.name}</span>
                  ) : r.name}
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums">{r.claims}</td>
                <td className="py-2.5 px-3 text-right tabular-nums">{formatInrShort(r.billed)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-success">{formatInrShort(r.settled)}</td>
                <td className="py-2.5 px-3 text-right tabular-nums text-destructive">{formatInrShort(r.outstanding)}</td>
                <td className={`py-2.5 px-3 text-right tabular-nums font-medium ${
                  r.ncrPct >= 70 ? "text-success" : r.ncrPct >= 50 ? "text-warning" : "text-destructive"
                }`}>
                  {r.ncrPct}%
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{r.share}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-xs text-muted-foreground">
                  No data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
