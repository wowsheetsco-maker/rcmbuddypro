import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, Users, Clock, ShieldAlert } from "lucide-react";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { buildPayerStats } from "@/lib/payerScorecard";
import { buildPayerMonthly, buildPeerMonthly, type MonthlyPoint } from "@/lib/payerMonthlyMetrics";

type Metric = "denialPct" | "avgTat" | "netRealPct";
type View = "tpa" | "insurer";

const METRIC_LABEL: Record<Metric, string> = {
  denialPct: "Denial rate (%)",
  avgTat: "Avg TAT (days)",
  netRealPct: "Net realisation (%)",
};

const METRIC_UNIT: Record<Metric, string> = {
  denialPct: "%",
  avgTat: "d",
  netRealPct: "%",
};

const SERIES_COLORS = [
  "hsl(210, 90%, 55%)",
  "hsl(340, 75%, 55%)",
  "hsl(150, 60%, 40%)",
  "hsl(35, 90%, 50%)",
  "hsl(270, 65%, 55%)",
  "hsl(190, 70%, 45%)",
];

export default function BenchmarksPage() {
  const { claims, loading } = useLiveClaims();
  const [view, setView] = useState<View>("tpa");
  const [metric, setMetric] = useState<Metric>("denialPct");
  const [topN, setTopN] = useState(5);

  // Rank payers by claim volume so trend chart focuses on material payers.
  const topPayers = useMemo(() => {
    const stats = buildPayerStats(claims, view);
    return stats.slice().sort((a, b) => b.claims - a.claims).slice(0, topN);
  }, [claims, view, topN]);

  const peer = useMemo(() => buildPeerMonthly(claims, view, 6), [claims, view]);

  // Wide chart data: one row per month, one column per payer + peer avg.
  const chartData = useMemo(() => {
    const perPayer = topPayers.map((p) => ({
      name: p.name,
      series: buildPayerMonthly(claims, p.name, view, 6),
    }));
    return peer.map((peerPoint, i) => {
      const row: Record<string, string | number> = {
        month: peerPoint.label,
        peer: peerPoint[metric],
      };
      for (const p of perPayer) row[p.name] = p.series[i]?.[metric] ?? 0;
      return row;
    });
  }, [claims, topPayers, peer, metric, view]);

  // Peer averages for the KPI strip (current vs prev month).
  const cur = peer.at(-1);
  const prev = peer.at(-2);
  const delta = (a?: MonthlyPoint, b?: MonthlyPoint, k: Metric = metric) => {
    const av = a?.[k] ?? 0, bv = b?.[k] ?? 0;
    return +(av - bv).toFixed(1);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground">Payer &amp; TPA Benchmarks</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Month-wise denial rate, turnaround time and realisation trends across your top payers,
              with peer-average overlay.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={(v) => setView(v as View)}>
              <TabsList>
                <TabsTrigger value="tpa"><Users className="h-3.5 w-3.5 mr-1.5" />TPA</TabsTrigger>
                <TabsTrigger value="insurer"><Users className="h-3.5 w-3.5 mr-1.5" />Insurer</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* KPI strip — peer averages */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <BenchmarkKpi
            label="Peer denial rate"
            icon={<ShieldAlert className="h-3.5 w-3.5 text-destructive" />}
            value={`${cur?.denialPct ?? 0}%`}
            delta={delta(cur, prev, "denialPct")}
            unit="pp"
            lowerIsBetter
            loading={loading}
          />
          <BenchmarkKpi
            label="Peer avg TAT"
            icon={<Clock className="h-3.5 w-3.5 text-warning" />}
            value={`${cur?.avgTat ?? 0}d`}
            delta={delta(cur, prev, "avgTat")}
            unit="d"
            lowerIsBetter
            loading={loading}
          />
          <BenchmarkKpi
            label="Peer net realisation"
            icon={<TrendingUp className="h-3.5 w-3.5 text-success" />}
            value={`${cur?.netRealPct ?? 0}%`}
            delta={delta(cur, prev, "netRealPct")}
            unit="pp"
            lowerIsBetter={false}
            loading={loading}
          />
        </div>

        {/* Chart controls */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">
                {METRIC_LABEL[metric]} — last 6 months
              </CardTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                {(["denialPct", "avgTat", "netRealPct"] as Metric[]).map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={metric === m ? "default" : "outline"}
                    className="h-7 text-[11px]"
                    onClick={() => setMetric(m)}
                  >
                    {METRIC_LABEL[m]}
                  </Button>
                ))}
                <div className="mx-2 h-5 w-px bg-border" />
                {[3, 5, 8].map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant={topN === n ? "secondary" : "ghost"}
                    className="h-7 text-[11px]"
                    onClick={() => setTopN(n)}
                  >
                    Top {n}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No claims data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}${METRIC_UNIT[metric]}`}
                    width={50}
                  />
                  <Tooltip
                    formatter={(v: number) => `${v}${METRIC_UNIT[metric]}`}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="peer"
                    name="Peer avg"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  {topPayers.map((p, i) => (
                    <Line
                      key={p.name}
                      type="monotone"
                      dataKey={p.name}
                      name={p.name.length > 24 ? `${p.name.slice(0, 22)}…` : p.name}
                      stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Benchmark leaderboard */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Top {topN} {view === "tpa" ? "TPAs" : "insurers"} vs peer average
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left font-medium py-1.5">Payer</th>
                  <th className="text-right font-medium py-1.5">Claims</th>
                  <th className="text-right font-medium py-1.5">Denial %</th>
                  <th className="text-right font-medium py-1.5">Avg TAT</th>
                  <th className="text-right font-medium py-1.5">Net real %</th>
                  <th className="text-right font-medium py-1.5">vs Peer</th>
                </tr>
              </thead>
              <tbody>
                {topPayers.map((p) => {
                  const vs =
                    metric === "denialPct" ? p.denialPct - (cur?.denialPct ?? 0)
                    : metric === "avgTat" ? p.avgTat - (cur?.avgTat ?? 0)
                    : p.netRealPct - (cur?.netRealPct ?? 0);
                  const lower = metric !== "netRealPct";
                  const bad = lower ? vs > 0 : vs < 0;
                  return (
                    <tr key={p.name} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{p.name}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.claims}</td>
                      <td className="py-1.5 text-right tabular-nums">{p.denialPct}%</td>
                      <td className="py-1.5 text-right tabular-nums">{p.avgTat}d</td>
                      <td className="py-1.5 text-right tabular-nums">{p.netRealPct}%</td>
                      <td className="py-1.5 text-right tabular-nums">
                        <Badge
                          variant="outline"
                          className={
                            bad
                              ? "text-destructive border-destructive/40 bg-destructive/10"
                              : "text-success border-success/40 bg-success/10"
                          }
                        >
                          {vs > 0 ? "+" : ""}{vs.toFixed(1)}{METRIC_UNIT[metric] === "d" ? "d" : "pp"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {topPayers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      No payers in scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function BenchmarkKpi({
  label, icon, value, delta, unit, lowerIsBetter, loading,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  delta: number;
  unit: string;
  lowerIsBetter: boolean;
  loading: boolean;
}) {
  const positive = delta === 0 ? null : lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <Card className="shadow-sm">
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <div className="text-xl font-semibold tabular-nums">
            {loading ? "…" : value}
          </div>
          {!loading && delta !== 0 && (
            <Badge
              variant="outline"
              className={
                positive
                  ? "text-success border-success/40 bg-success/10"
                  : "text-destructive border-destructive/40 bg-destructive/10"
              }
            >
              {delta > 0 ? "+" : ""}{delta}{unit} MoM
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
