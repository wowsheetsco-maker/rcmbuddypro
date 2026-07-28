import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { Card } from "@/components/ui/card";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Building2, FileText, IndianRupee, Percent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, Camera, GitCompare, Loader2, Search, X,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import ScorecardsSwitcher from "@/components/analytics/ScorecardsSwitcher";
import { formatInrShort } from "@/data/mockClaims";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { buildPayerStats, GRADE_TONE, type PayerStats } from "@/lib/payerScorecard";
import { buildBenchmarks } from "@/lib/payerBenchmarks";
import { diffAgainstSnapshot, listSnapshots, type PayerSnapshot } from "@/lib/payerSnapshots";
import { SnapshotDialog } from "@/components/SnapshotDialog";
import { CompareDialog } from "@/components/PayerCompareDialog";

type SortKey = keyof Pick<
  PayerStats,
  "claims" | "uniquePatients" | "claimed" | "approved" | "settled" | "tds" | "discPct" | "avgTat" | "approvalPct" | "netRealPct" | "outstanding" | "score"
>;

const COLUMNS: { key: SortKey | "select" | "name" | "grade"; label: string; align?: "left" | "right" }[] = [
  { key: "select", label: "", align: "left" },
  { key: "name", label: "TPA / Insurer", align: "left" },
  { key: "claims", label: "Claims", align: "right" },
  { key: "uniquePatients", label: "Unique Pts", align: "right" },
  { key: "claimed", label: "Claimed", align: "right" },
  { key: "approved", label: "Approved", align: "right" },
  { key: "settled", label: "Settled", align: "right" },
  { key: "discPct", label: "Disc%", align: "right" },
  { key: "avgTat", label: "Avg TAT", align: "right" },
  { key: "approvalPct", label: "Approval%", align: "right" },
  { key: "netRealPct", label: "Net Real%", align: "right" },
  { key: "grade", label: "Grade", align: "right" },
];

const MAX_COMPARE = 4;

export default function PayerScorecardPage() {
  const { claims, loading, isMock } = useLiveClaims();
  const [view, setView] = useState<"tpa" | "insurer">("tpa");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("outstanding");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [baselineId, setBaselineId] = useState<string | null>(null);

  // Reset selection when toggling view (TPA names ≠ insurer names)
  useEffect(() => {
    setSelected(new Set());
  }, [view]);

  const payers: PayerStats[] = useMemo(() => {
    const base = buildPayerStats(claims, view);
    const filtered = search.trim()
      ? base.filter((p) => p.name.toLowerCase().includes(search.toLowerCase().trim()))
      : base;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [claims, view, search, sortKey, sortDir]);

  const benchmarks = useMemo(() => buildBenchmarks(payers), [payers]);

  const baseline: PayerSnapshot | null = useMemo(() => {
    if (!baselineId) return null;
    return listSnapshots(view).find((s) => s.id === baselineId) ?? null;
  }, [baselineId, view]);

  const deltas = useMemo(
    () => diffAgainstSnapshot(payers, baseline),
    [payers, baseline],
  );
  const deltaByName = useMemo(
    () => new Map(deltas.map((d) => [d.name.toLowerCase(), d])),
    [deltas],
  );

  const totals = useMemo(() => {
    return payers.reduce(
      (acc, p) => {
        acc.claims += p.claims;
        acc.outstanding += p.outstanding;
        acc.approved += p.approved;
        acc.settled += p.settled;
        return acc;
      },
      { claims: 0, outstanding: 0, approved: 0, settled: 0 },
    );
  }, [payers]);

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = name.toLowerCase();
      if (next.has(key)) next.delete(key);
      else if (next.size < MAX_COMPARE) next.add(key);
      return next;
    });
  };

  const selectedPayers = useMemo(
    () => payers.filter((p) => selected.has(p.name.toLowerCase())),
    [payers, selected],
  );

  return (
    <AppLayout>
      <TooltipProvider delayDuration={150}>
        <div className="space-y-5">
          <ScorecardsSwitcher />
          {/* Header */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-display text-foreground">Payer Scorecard</h1>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
                Performance grades and metrics across {view === "tpa" ? "TPAs" : "Insurers"}
                {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                {isMock && !loading && (
                  <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>
                )}
                {baseline && (
                  <Badge variant="outline" className="text-[9px] py-0 border-primary text-primary">
                    Δ vs {baseline.label}
                  </Badge>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search payer..."
                  className="h-9 pl-8 w-56 text-xs"
                />
              </div>
              <div className="flex items-center gap-1 rounded-md border bg-card p-0.5">
                {(["tpa", "insurer"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`text-xs px-3 py-1.5 rounded transition-colors ${
                      view === v
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "tpa" ? "By TPA" : "By Insurer"}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setSnapOpen(true)}>
                <Camera className="h-3.5 w-3.5 mr-1.5" />
                Snapshots
              </Button>
            </div>
          </div>

          {/* Compare bar — appears only when payers selected */}
          {selected.size > 0 && (
            <Card className="p-3 bg-primary/5 border-primary/30 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  {selected.size} selected for comparison
                </span>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {selectedPayers.map((p) => (
                    <Badge key={p.name} variant="outline" className="bg-card text-xs gap-1.5 pl-2 pr-1 py-0.5">
                      {p.name}
                      <button
                        onClick={() => toggleSelect(p.name)}
                        className="hover:bg-muted rounded p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                <Button size="sm" onClick={() => setCompareOpen(true)} disabled={selected.size < 2}>
                  <GitCompare className="h-3.5 w-3.5 mr-1.5" />
                  Compare
                </Button>
              </div>
              {selected.size >= MAX_COMPARE && (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Max {MAX_COMPARE} payers — deselect one to add another.
                </p>
              )}
            </Card>
          )}

          {/* KPI strip */}
          <KpiGrid cols={4}>
            <KpiCard
              label="Payers"
              value={payers.length.toString()}
              icon={<Building2 className="h-3.5 w-3.5 text-primary" />}
              caption="Active accounts"
            />
            <KpiCard
              label="Claims"
              value={totals.claims.toLocaleString("en-IN")}
              icon={<FileText className="h-3.5 w-3.5 text-secondary" />}
              caption="In scorecard"
            />
            <KpiCard
              label="Outstanding"
              value={formatInrShort(totals.outstanding)}
              icon={<IndianRupee className="h-3.5 w-3.5 text-warning" />}
              caption="Pending AR"
            />
            <KpiCard
              label="Net Realisation"
              value={`${totals.approved ? Math.round((totals.settled / totals.approved) * 100) : 0}%`}
              tone="success"
              icon={<Percent className="h-3.5 w-3.5 text-success" />}
              caption="Settled / approved"
            />
          </KpiGrid>

          {/* Table */}
          <Card className="shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {COLUMNS.map((c) => {
                      const sortable = c.key !== "name" && c.key !== "grade" && c.key !== "select";
                      const isActive = sortable && sortKey === c.key;
                      return (
                        <th
                          key={c.key}
                          onClick={() => sortable && handleSort(c.key as SortKey)}
                          className={`py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide select-none ${
                            c.align === "right" ? "text-right" : "text-left"
                          } ${sortable ? "cursor-pointer hover:text-foreground" : ""}`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {c.label}
                            {isActive && (sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                  {/* Benchmark / median row */}
                  {payers.length > 1 && (
                    <tr className="border-b bg-accent/20 text-[11px]">
                      <td className="py-1.5 px-3"></td>
                      <td className="py-1.5 px-3 font-semibold uppercase tracking-wider text-muted-foreground">
                        Portfolio median
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{benchmarks.median.claims}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{benchmarks.median.uniquePatients}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">—</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{benchmarks.median.discPct}%</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{benchmarks.median.avgTat || "—"}{benchmarks.median.avgTat ? "d" : ""}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{benchmarks.median.approvalPct}%</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{benchmarks.median.netRealPct}%</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{benchmarks.median.score}</td>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {payers.map((p) => {
                    const isSelected = selected.has(p.name.toLowerCase());
                    const d = deltaByName.get(p.name.toLowerCase());
                    return (
                      <tr
                        key={`${p.type}-${p.name}`}
                        className={`border-b last:border-0 transition-colors ${
                          isSelected ? "bg-primary/5" : "hover:bg-muted/40"
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(p.name)}
                            disabled={!isSelected && selected.size >= MAX_COMPARE}
                          />
                        </td>
                        <td className="py-2.5 px-3">
                          <Link
                            to={`/analytics/tpa-report?payer=${encodeURIComponent(p.name)}&type=${p.type === "TPA" ? "tpa" : "insurer"}`}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {p.name}
                          </Link>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Outstanding {formatInrShort(p.outstanding)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{p.claims}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{p.uniquePatients}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatInrShort(p.claimed)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatInrShort(p.approved)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{formatInrShort(p.settled)}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <DiscBadge pct={p.discPct} />
                          <DeltaTag delta={d?.discDelta} unit="%" lowerIsBetter />
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {p.avgTat > 0 ? (
                            <span className={p.avgTat > 30 ? "text-warning font-medium" : ""}>{p.avgTat}d</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          <DeltaTag delta={d?.tatDelta} unit="d" lowerIsBetter />
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {p.approvalPct}%
                          <DeltaTag delta={d?.approvalDelta} unit="%" />
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          <span className={p.netRealPct >= 80 ? "text-success font-medium" : ""}>
                            {p.netRealPct}%
                          </span>
                          <DeltaTag delta={d?.netRealDelta} unit="%" />
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={`inline-block min-w-[2.25rem] px-2 py-0.5 rounded text-[11px] font-semibold border ${GRADE_TONE[p.grade]}`}
                              >
                                {p.grade}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs max-w-[18rem]">
                              <div className="font-medium">Score {p.score}/100 · Grade {p.grade}</div>
                              <div className="text-muted-foreground mt-1 leading-relaxed">
                                Volume 35% + Net Real 25% + Approval 20% + TAT 12% + Disc 8%
                              </div>
                              {p.claims < 10 && (
                                <div className="mt-1.5 text-warning text-[10.5px]">
                                  ⚠ Low volume ({p.claims} claim{p.claims === 1 ? "" : "s"}) — grade capped at {p.claims < 3 ? "C" : "B"}.
                                </div>
                              )}
                              {d?.scoreDelta !== undefined && d.scoreDelta !== 0 && (
                                <div className="mt-1.5 text-[10.5px]">
                                  Δ vs baseline: <span className={d.scoreDelta > 0 ? "text-success" : "text-destructive"}>
                                    {d.scoreDelta > 0 ? "+" : ""}{d.scoreDelta}
                                  </span>
                                </div>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && payers.length === 0 && (
                    <tr>
                      <td colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground text-xs">
                        No payers match your filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Legend */}
          <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
            <span className="font-medium">Legend:</span>
            <span><b>Disc%</b> = (Approved − Settled − TDS) / Approved</span>
            <span><b>Net Real%</b> = Settled / Approved</span>
            <span><b>Grade</b> weights volume first (35%), then net real, approval, TAT, disc</span>
            <span>Tick up to {MAX_COMPARE} rows to compare side-by-side.</span>
            <span>Capture a snapshot before negotiations to track Δ.</span>
          </div>
        </div>

        <CompareDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          payers={selectedPayers}
          benchmarks={benchmarks}
          onRemove={(name) => toggleSelect(name)}
        />
        <SnapshotDialog
          open={snapOpen}
          onOpenChange={setSnapOpen}
          view={view}
          payers={payers}
          baselineId={baselineId}
          onSelectBaseline={setBaselineId}
        />
      </TooltipProvider>
    </AppLayout>
  );
}


function DiscBadge({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-muted-foreground">—</span>;
  if (pct < 0)
    return <span className="text-success text-[11px] font-medium">{pct.toFixed(1)}% over</span>;
  const isHigh = pct > 15;
  const isMed = pct > 5;
  return (
    <span className={`text-[11px] font-medium ${isHigh ? "text-destructive" : isMed ? "text-warning" : "text-muted-foreground"}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function DeltaTag({
  delta,
  unit,
  lowerIsBetter,
}: {
  delta?: number;
  unit: string;
  lowerIsBetter?: boolean;
}) {
  if (delta === undefined || delta === 0 || Number.isNaN(delta)) return null;
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  const Icon = delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div
      className={`text-[9.5px] font-medium inline-flex items-center gap-0.5 ml-1 ${
        better ? "text-success" : "text-destructive"
      }`}
    >
      <Icon className="h-2.5 w-2.5" />
      {delta > 0 ? "+" : ""}{delta}{unit}
    </div>
  );
}
