import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import {
  ArrowDown, ArrowUp, Building2, Download, Loader2, Search, AlertTriangle, Mail,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { KpiCard as SharedKpiCard } from "@/components/ui/kpi-card";
import { Wallet, CheckCircle2, AlertCircle, Percent, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatInrShort } from "@/data/mockClaims";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import {
  buildCorporateStats, corporateRowsToCsv, RISK_DOT, RISK_TONE,
  type CorporateStats,
} from "@/lib/corporateStats";
import CorporateDrillDownDrawer from "@/components/CorporateDrillDownDrawer";

type SortKey = keyof Pick<
  CorporateStats,
  "claims" | "uniqueMembers" | "billed" | "settled" | "outstanding" | "ncrPct" | "denialPct" | "avgDays" | "irdaiBreach"
>;

type RiskFilter = "all" | CorporateStats["risk"];
type StatusFilter = "all" | "with_outstanding" | "fully_settled" | "with_denials";
type TopFilter = 10 | 25 | 50 | 100 | 0;

const COLORS = {
  billed: "hsl(var(--foreground))",
  settled: "hsl(var(--success))",
  outstanding: "hsl(var(--destructive))",
  ncr: "hsl(var(--warning))",
  denial: "hsl(var(--destructive))",
};

// Aging chart colour palette (low → high age = green → red)
const AGING_COLORS = [
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--destructive))",
];

export default function CorporatePerformancePage() {
  const { claims, loading, isMock } = useLiveClaims();
  const [search, setSearch] = useState("");
  const [tpaFilter, setTpaFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("outstanding");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [topN, setTopN] = useState<TopFilter>(10);
  const [drillDown, setDrillDown] = useState<CorporateStats | null>(null);

  const allCorporates = useMemo(() => buildCorporateStats(claims), [claims]);

  const tpaOptions = useMemo(() => {
    const set = new Set<string>();
    allCorporates.forEach((c) => c.tpas.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [allCorporates]);

  const filtered = useMemo(() => {
    let rows = allCorporates;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (tpaFilter !== "all") rows = rows.filter((r) => r.tpas.includes(tpaFilter));
    if (statusFilter === "with_outstanding") rows = rows.filter((r) => r.outstanding > 0);
    else if (statusFilter === "fully_settled") rows = rows.filter((r) => r.outstanding === 0);
    else if (statusFilter === "with_denials") rows = rows.filter((r) => r.denialPct > 0);
    if (riskFilter !== "all") rows = rows.filter((r) => r.risk === riskFilter);

    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return topN === 0 ? rows : rows.slice(0, topN);
  }, [allCorporates, search, tpaFilter, statusFilter, riskFilter, sortKey, sortDir, topN]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.billed += r.billed;
        acc.settled += r.settled;
        acc.outstanding += r.outstanding;
        acc.claims += r.claims;
        acc.breach += r.irdaiBreach;
        return acc;
      },
      { billed: 0, settled: 0, outstanding: 0, claims: 0, breach: 0 },
    );
  }, [filtered]);

  const avgNcr = totals.billed
    ? +((totals.settled / totals.billed) * 100).toFixed(1)
    : 0;
  const criticalCount = filtered.filter((r) => r.risk === "critical").length;

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const handleExport = () => {
    const csv = corporateRowsToCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `corporate-performance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chartData = filtered.slice(0, 10).map((r) => ({
    name: r.name.length > 18 ? r.name.slice(0, 18) + "…" : r.name,
    fullName: r.name,
    Billed: r.billed,
    Settled: r.settled,
    Outstanding: r.outstanding,
    NCR: r.ncrPct,
    Denial: r.denialPct,
    Members: r.uniqueMembers,
  }));

  const agingTotal = filtered.reduce(
    (acc, r) => {
      acc.d0_30 += r.aging.d0_30;
      acc.d31_60 += r.aging.d31_60;
      acc.d61_90 += r.aging.d61_90;
      acc.d90_plus += r.aging.d90_plus;
      return acc;
    },
    { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
  );

  const claimCountData = filtered.slice(0, 10).map((r) => ({
    name: r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name,
    value: r.claims,
  }));
  const PIE_COLORS = [
    "hsl(var(--destructive))",
    "hsl(var(--foreground))",
    "hsl(var(--primary))",
    "hsl(var(--accent-foreground))",
    "hsl(var(--success))",
    "hsl(var(--warning))",
    "hsl(220 60% 50%)",
    "hsl(280 50% 55%)",
    "hsl(340 60% 55%)",
    "hsl(180 50% 45%)",
  ];

  return (
    <AppLayout>
      <TooltipProvider delayDuration={150}>
        <div className="space-y-5">
          <ScorecardsSwitcher />
          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
                <Building2 className="h-6 w-6 text-primary" />
                Corporate Performance
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
                Employer / group health policy analytics — outstanding, denial rate, NCR, and breach tracking.
                {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                {isMock && !loading && (
                  <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Filter bar */}
          <Card className="p-3 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <FilterBlock label="Search corporate">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Type name..."
                    className="h-9 pl-8 text-xs"
                  />
                </div>
              </FilterBlock>
              <FilterBlock label="TPA / Insurer Filter">
                <Select value={tpaFilter} onValueChange={setTpaFilter}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="All TPAs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All TPAs</SelectItem>
                    {tpaOptions.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterBlock>
              <FilterBlock label="Claim Status">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Claims</SelectItem>
                    <SelectItem value="with_outstanding" className="text-xs">With Outstanding</SelectItem>
                    <SelectItem value="fully_settled" className="text-xs">Fully Settled</SelectItem>
                    <SelectItem value="with_denials" className="text-xs">With Denials</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBlock>
              <FilterBlock label="Risk Profile">
                <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskFilter)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Risk Levels</SelectItem>
                    <SelectItem value="critical" className="text-xs">Critical</SelectItem>
                    <SelectItem value="high" className="text-xs">High</SelectItem>
                    <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                    <SelectItem value="low" className="text-xs">Low</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBlock>
              <FilterBlock label="Show Top">
                <Select value={String(topN)} onValueChange={(v) => setTopN(Number(v) as TopFilter)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10" className="text-xs">Top 10</SelectItem>
                    <SelectItem value="25" className="text-xs">Top 25</SelectItem>
                    <SelectItem value="50" className="text-xs">Top 50</SelectItem>
                    <SelectItem value="100" className="text-xs">Top 100</SelectItem>
                    <SelectItem value="0" className="text-xs">All</SelectItem>
                  </SelectContent>
                </Select>
              </FilterBlock>
            </div>
          </Card>

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Corporates" value={filtered.length.toString()} sub="in filtered view" />
            <KpiCard label="Total Billed" value={formatInrShort(totals.billed)} />
            <KpiCard label="Collections" value={formatInrShort(totals.settled)} tone="success" />
            <KpiCard label="Outstanding" value={formatInrShort(totals.outstanding)} tone="destructive" sub="across open claims" />
            <KpiCard label="Avg NCR" value={`${avgNcr}%`} tone={avgNcr >= 70 ? "success" : avgNcr >= 50 ? "warning" : "destructive"} />
            <KpiCard
              label="SLA Breach"
              value={totals.breach.toString()}
              tone={totals.breach > 0 ? "destructive" : "muted"}
              sub="90+ day claims"
            />
          </div>

          {criticalCount > 0 && (
            <Card className="p-3 border-destructive/40 bg-destructive/5 shadow-sm">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="font-semibold text-destructive">{criticalCount} corporate{criticalCount > 1 ? "s" : ""}</span>
                <span className="text-muted-foreground">flagged as critical risk — heavy 90+ day exposure or denials &gt; 30%.</span>
              </div>
            </Card>
          )}

          {/* Top corporates chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2">
                  Top Corporates — Billed vs Settled vs Outstanding
                </h3>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatInrShort(v)} />
                    <RTooltip
                      contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      formatter={(v: number) => formatInrShort(v)}
                      labelFormatter={(_, p) => p?.[0]?.payload?.fullName ?? ""}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Billed" fill={COLORS.billed} />
                    <Bar dataKey="Settled" fill={COLORS.settled} />
                    <Bar dataKey="Outstanding" fill={COLORS.outstanding} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2">
                  Net Collection Rate % by Corporate
                </h3>
                <span className="text-[10px] text-muted-foreground">Avg: {avgNcr}%</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={110} interval={0} />
                    <RTooltip
                      contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      formatter={(v: number) => `${v}%`}
                      labelFormatter={(_, p) => p?.[0]?.payload?.fullName ?? ""}
                    />
                    <Bar dataKey="NCR" radius={[0, 3, 3, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={chartData[i].NCR < 60 ? COLORS.outstanding : COLORS.ncr} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* 3-column secondary chart row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2 mb-3">
                Denial Rate by Corporate
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                    <RTooltip
                      contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      formatter={(v: number) => `${v}%`}
                      labelFormatter={(_, p) => p?.[0]?.payload?.fullName ?? ""}
                    />
                    <Bar dataKey="Denial" fill={COLORS.denial} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2 mb-3">
                Outstanding Aging Breakdown
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { bucket: "0-30d", Amount: agingTotal.d0_30 },
                      { bucket: "31-60d", Amount: agingTotal.d31_60 },
                      { bucket: "61-90d", Amount: agingTotal.d61_90 },
                      { bucket: "90+d", Amount: agingTotal.d90_plus },
                    ]}
                    margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatInrShort(v)} />
                    <RTooltip
                      contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      formatter={(v: number) => formatInrShort(v)}
                    />
                    <Bar dataKey="Amount">
                      {AGING_COLORS.map((c, i) => (
                        <Cell key={i} fill={c} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4 shadow-sm">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2 mb-3">
                Claim Count by Corporate
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={claimCountData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={1}
                    >
                      {claimCountData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RTooltip
                      contentStyle={{ fontSize: 11, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      formatter={(v: number) => `${v} claims`}
                    />
                    <Legend wrapperStyle={{ fontSize: 9 }} layout="vertical" align="right" verticalAlign="middle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Performance matrix table */}
          <Card className="shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-l-2 border-destructive pl-2">
                Corporate-wise Performance Matrix
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {filtered.length} corporate{filtered.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <Th className="text-left">Corporate / Employer</Th>
                    <Th className="text-left">TPAs</Th>
                    <ThSort active={sortKey === "claims"} dir={sortDir} onClick={() => handleSort("claims")}>Claims</ThSort>
                    <ThSort active={sortKey === "uniqueMembers"} dir={sortDir} onClick={() => handleSort("uniqueMembers")}>Members</ThSort>
                    <ThSort active={sortKey === "billed"} dir={sortDir} onClick={() => handleSort("billed")}>Billed</ThSort>
                    <ThSort active={sortKey === "settled"} dir={sortDir} onClick={() => handleSort("settled")}>Settled</ThSort>
                    <ThSort active={sortKey === "outstanding"} dir={sortDir} onClick={() => handleSort("outstanding")}>Outstanding</ThSort>
                    <ThSort active={sortKey === "ncrPct"} dir={sortDir} onClick={() => handleSort("ncrPct")}>NCR %</ThSort>
                    <ThSort active={sortKey === "denialPct"} dir={sortDir} onClick={() => handleSort("denialPct")}>Denial %</ThSort>
                    <ThSort active={sortKey === "avgDays"} dir={sortDir} onClick={() => handleSort("avgDays")}>Avg Days</ThSort>
                    <ThSort active={sortKey === "irdaiBreach"} dir={sortDir} onClick={() => handleSort("irdaiBreach")}>90+ Breach</ThSort>
                    <Th className="text-left">Risk</Th>
                    <Th className="text-left">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.name}
                      onClick={() => setDrillDown(r)}
                      className="border-b last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-foreground hover:text-primary transition-colors">{r.name}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {r.insurers.length} insurer{r.insurers.length === 1 ? "" : "s"}
                          {r.lastActivity && ` · last activity ${new Date(r.lastActivity).toLocaleDateString("en-IN")}`}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-xs text-foreground/80 cursor-help">
                              {r.tpas[0] ? r.tpas[0].slice(0, 16) + (r.tpas[0].length > 16 ? "…" : "") : "—"}
                              {r.tpas.length > 1 && (
                                <span className="text-muted-foreground ml-1">+{r.tpas.length - 1}</span>
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs max-w-xs">
                            <div className="font-semibold mb-1">TPAs</div>
                            <ul className="space-y-0.5">
                              {r.tpas.map((t) => <li key={t}>• {t}</li>)}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{r.claims}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{r.uniqueMembers}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{formatInrShort(r.billed)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-success">{formatInrShort(r.settled)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-destructive font-medium">
                        {formatInrShort(r.outstanding)}
                      </td>
                      <td className={`py-2.5 px-3 text-right tabular-nums font-medium ${
                        r.ncrPct >= 75 ? "text-success" : r.ncrPct >= 50 ? "text-warning" : "text-destructive"
                      }`}>
                        {r.ncrPct}%
                      </td>
                      <td className={`py-2.5 px-3 text-right tabular-nums ${
                        r.denialPct > 15 ? "text-destructive font-medium" : ""
                      }`}>
                        {r.denialPct}%
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{r.avgDays}d</td>
                      <td className={`py-2.5 px-3 text-right tabular-nums ${
                        r.irdaiBreach > 0 ? "text-destructive font-semibold" : "text-muted-foreground"
                      }`}>
                        {r.irdaiBreach}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${RISK_TONE[r.risk]}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${RISK_DOT[r.risk]}`} />
                          {r.risk[0].toUpperCase() + r.risk.slice(1)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                to={`/claims?policyHolder=${encodeURIComponent(r.name)}`}
                                className="inline-flex items-center justify-center h-7 w-7 rounded border border-border hover:bg-muted hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Search className="h-3.5 w-3.5" />
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">View claims</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                to={`/communications/outstanding-reminders?corporate=${encodeURIComponent(r.name)}`}
                                className="inline-flex items-center justify-center h-7 w-7 rounded border border-border hover:bg-muted hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors"
                              >
                                <Mail className="h-3.5 w-3.5" />
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">Send reminder</TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={13} className="text-center py-10 text-muted-foreground text-xs">
                        No corporates match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Legend */}
          <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
            <span className="font-medium uppercase tracking-wide">Risk profile:</span>
            <LegendDot tone="destructive" label="Critical — NCR &lt; 40% or 50%+ in 90d aging" />
            <LegendDot tone="warning" label="High — NCR &lt; 60% or denials &gt; 15%" />
            <LegendDot tone="muted" label="Medium" />
            <LegendDot tone="success" label="Low" />
          </div>
        </div>
      </TooltipProvider>

      <CorporateDrillDownDrawer
        corporate={drillDown}
        allClaims={claims}
        open={!!drillDown}
        onOpenChange={(o) => { if (!o) setDrillDown(null); }}
      />
    </AppLayout>
  );
}

/* ---------- small presentation helpers ---------- */

function FilterBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function KpiCard({
  label, value, sub, tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "muted";
}) {
  const iconMap: Record<string, React.ReactNode> = {
    Corporates: <Building2 className="h-3.5 w-3.5 text-primary" />,
    "Total Billed": <Wallet className="h-3.5 w-3.5 text-primary" />,
    Collections: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
    Outstanding: <AlertCircle className="h-3.5 w-3.5 text-destructive" />,
    "Avg NCR": <Percent className="h-3.5 w-3.5 text-secondary" />,
    "SLA Breach": <ShieldAlert className="h-3.5 w-3.5 text-destructive" />,
  };
  const sharedTone: "default" | "success" | "denial" | "muted" =
    tone === "destructive" ? "denial" :
    tone === "warning" ? "default" :
    tone === "success" ? "success" :
    tone === "muted" ? "muted" : "default";
  return (
    <SharedKpiCard
      label={label}
      value={value}
      tone={sharedTone}
      icon={iconMap[label] ?? <Building2 className="h-3.5 w-3.5 text-primary" />}
      caption={sub}
    />
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}

function ThSort({
  children, active, dir, onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-right select-none cursor-pointer hover:text-foreground"
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </span>
    </th>
  );
}

function LegendDot({ tone, label }: { tone: "destructive" | "warning" | "muted" | "success"; label: string }) {
  const cls: Record<string, string> = {
    destructive: "bg-destructive",
    warning: "bg-warning",
    muted: "bg-muted-foreground",
    success: "bg-success",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${cls[tone]}`} />
      <span dangerouslySetInnerHTML={{ __html: label }} />
    </span>
  );
}
