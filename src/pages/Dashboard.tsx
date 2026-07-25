import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock, IndianRupee, FileText, ShieldAlert, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import AppLayout from "@/components/AppLayout";
import OnboardingChecklistModal from "@/components/OnboardingChecklistModal";
import AgingBucketsCard from "@/components/AgingBucketsCard";
import DenialAnalyticsCard from "@/components/DenialAnalyticsCard";
import HomePreferenceToggle from "@/components/HomePreferenceToggle";
import { supabase } from "@/integrations/supabase/client";
import { formatInrShort as formatInr } from "@/data/mockClaims";
import { useGlobalFilter } from "@/components/global-filter-context";

type ClaimRow = {
  claim_status: string;
  tpa_name: string;
  claimed_amount: number;
  settled_amount: number;
  outstanding_amount: number;
  is_irdai_breach: boolean;
  claim_creation_date: string;
  payment_update_date: string | null;
};

const SETTLED_STATUSES = new Set(["settled", "paid", "closed"]);
const DENIED_STATUSES = new Set(["pre auth denied", "claim denied", "discharge denied", "enhancement denied", "denied", "rejected"]);

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Dashboard() {
  const [allClaims, setAllClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { isWithin } = useGlobalFilter();
  const claims = useMemo(
    () => allClaims.filter((c) => isWithin(c.claim_creation_date)),
    [allClaims, isWithin],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Page through to bypass the 1000-row default limit
      const pageSize = 1000;
      let from = 0;
      const all: ClaimRow[] = [];
      // Loop until we get a short page
      // (RLS allows public select)
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("claims")
          .select("claim_status,tpa_name,claimed_amount,settled_amount,outstanding_amount,is_irdai_breach,claim_creation_date,payment_update_date")
          .range(from, from + pageSize - 1);
        if (error || !data) break;
        all.push(...(data as ClaimRow[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      if (!cancelled) {
        setAllClaims(all);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => {
    const total = claims.length;
    const breaches = claims.filter(c => c.is_irdai_breach).length;
    const totalClaimed = claims.reduce((s, c) => s + Number(c.claimed_amount || 0), 0);
    const totalSettled = claims.reduce((s, c) => s + Number(c.settled_amount || 0), 0);
    const totalOutstanding = claims.reduce((s, c) => s + Number(c.outstanding_amount || 0), 0);

    const settledCount = claims.filter(c => SETTLED_STATUSES.has(c.claim_status.toLowerCase())).length;
    const deniedCount = claims.filter(c => DENIED_STATUSES.has(c.claim_status.toLowerCase())).length;
    const queryCount = claims.filter(c => c.claim_status.toLowerCase().includes("query")).length;
    const openCount = total - settledCount - deniedCount;

    const settlementRate = total > 0 ? (settledCount / total) * 100 : 0;
    const denialRate = total > 0 ? (deniedCount / total) * 100 : 0;

    // Avg TAT: days between claim_creation_date and payment_update_date for settled claims
    const tatDays: number[] = [];
    for (const c of claims) {
      if (c.payment_update_date && c.claim_creation_date) {
        const start = new Date(c.claim_creation_date).getTime();
        const end = new Date(c.payment_update_date).getTime();
        const d = Math.floor((end - start) / 86_400_000);
        if (d >= 0 && d < 365) tatDays.push(d);
      }
    }
    const avgTat = tatDays.length ? Math.round(tatDays.reduce((a, b) => a + b, 0) / tatDays.length) : 0;

    return { total, breaches, totalClaimed, totalSettled, totalOutstanding, settledCount, deniedCount, queryCount, openCount, settlementRate, denialRate, avgTat };
  }, [claims]);

  const monthlyData = useMemo(() => {
    const buckets = new Map<string, { month: string; claimed: number; settled: number; denied: number; sortKey: number }>();
    for (const c of claims) {
      if (!c.claim_creation_date) continue;
      const d = new Date(c.claim_creation_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
      const sortKey = d.getFullYear() * 12 + d.getMonth();
      const b = buckets.get(key) ?? { month: label, claimed: 0, settled: 0, denied: 0, sortKey };
      b.claimed += Number(c.claimed_amount || 0);
      b.settled += Number(c.settled_amount || 0);
      if (DENIED_STATUSES.has(c.claim_status.toLowerCase())) b.denied += Number(c.claimed_amount || 0);
      buckets.set(key, b);
    }
    return Array.from(buckets.values()).sort((a, b) => a.sortKey - b.sortKey).slice(-6);
  }, [claims]);

  const statusData = useMemo(() => [
    { name: "Open", value: stats.openCount, color: "hsl(226, 56%, 26%)" },
    { name: "Settled", value: stats.settledCount, color: "hsl(170, 84%, 22%)" },
    { name: "Denied", value: stats.deniedCount, color: "hsl(0, 70%, 32%)" },
    { name: "Query", value: stats.queryCount, color: "hsl(30, 88%, 38%)" },
  ].filter(s => s.value > 0), [stats]);

  const tpaPerformance = useMemo(() => {
    const map = new Map<string, { tpa: string; outstanding: number; claims: number; tatTotal: number; tatCount: number }>();
    for (const c of claims) {
      const key = c.tpa_name || "Unknown";
      const e = map.get(key) ?? { tpa: key, outstanding: 0, claims: 0, tatTotal: 0, tatCount: 0 };
      e.outstanding += Number(c.outstanding_amount || 0);
      e.claims += 1;
      if (c.payment_update_date && c.claim_creation_date) {
        const days = Math.floor((new Date(c.payment_update_date).getTime() - new Date(c.claim_creation_date).getTime()) / 86_400_000);
        if (days >= 0 && days < 365) { e.tatTotal += days; e.tatCount += 1; }
      }
      map.set(key, e);
    }
    return Array.from(map.values())
      .map(e => ({ tpa: e.tpa, outstanding: e.outstanding, claims: e.claims, avgTat: e.tatCount ? Math.round(e.tatTotal / e.tatCount) : 0 }))
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 8);
  }, [claims]);

  const kpis = [
    { label: "Total Outstanding", value: formatInr(stats.totalOutstanding), caption: `${stats.total} claims`, icon: IndianRupee, tone: "text-primary" },
    { label: "Open Claims", value: stats.openCount.toLocaleString("en-IN"), caption: `of ${stats.total} total`, icon: FileText, tone: "text-secondary" },
    { label: "SLA Breaches", value: stats.breaches.toLocaleString("en-IN"), caption: ">15 days outstanding", icon: ShieldAlert, tone: "text-destructive" },
    { label: "Avg TAT", value: `${stats.avgTat} days`, caption: "creation → payment", icon: Clock, tone: "text-warning" },
    { label: "Settlement Rate", value: `${stats.settlementRate.toFixed(1)}%`, caption: `${stats.settledCount} settled`, icon: CheckCircle2, tone: "text-success" },
    { label: "Denial Rate", value: `${stats.denialRate.toFixed(1)}%`, caption: `${stats.deniedCount} denied`, icon: AlertTriangle, tone: "text-destructive" },
  ];

  return (
    <AppLayout>
      <OnboardingChecklistModal />
      <div className="space-y-6">
        {/* Page Title */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-display text-foreground">Executive Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Revenue cycle overview · {stats.total.toLocaleString("en-IN")} claims · {formatInr(stats.totalClaimed)} claimed
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HomePreferenceToggle />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

        {/* Aging Buckets — CFO's first question, always */}
        <AgingBucketsCard />

        {/* KPI Cards */}
        <KpiGrid cols={6}>
          {kpis.map((kpi) => (
            <KpiCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              loading={loading}
              icon={<kpi.icon className={`h-3.5 w-3.5 ${kpi.tone}`} />}
              caption={kpi.caption}
            />
          ))}
        </KpiGrid>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Monthly Trend */}
          <Card className="lg:col-span-2 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Monthly Claim Trends (last 6 months)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyData} barGap={2}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatInr(v)} />
                  <Tooltip formatter={(v: number) => formatInr(v)} />
                  <Bar dataKey="claimed" fill="hsl(226, 56%, 26%)" radius={[3, 3, 0, 0]} name="Claimed" />
                  <Bar dataKey="settled" fill="hsl(170, 84%, 22%)" radius={[3, 3, 0, 0]} name="Settled" />
                  <Bar dataKey="denied" fill="hsl(0, 70%, 32%)" radius={[3, 3, 0, 0]} name="Denied" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Status Distribution */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Claim Status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={2}>
                    {statusData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {statusData.map((s) => (
                  <div key={s.name} className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-[11px] text-muted-foreground">{s.name} ({s.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Denial Analytics widget (CFO + Billing) */}
        <DenialAnalyticsCard />

        {/* TPA Performance Table */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">TPA Performance (top 8 by outstanding)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">TPA</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Outstanding</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Avg TAT</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Claims</th>
                    <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {tpaPerformance.map((tpa) => (
                    <tr key={tpa.tpa} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 px-3 font-medium">{tpa.tpa}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{formatInr(tpa.outstanding)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{tpa.avgTat} days</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{tpa.claims}</td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge variant={tpa.avgTat > 30 ? "destructive" : "secondary"} className="text-[10px]">
                          {tpa.avgTat > 30 ? "High" : "Normal"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!loading && tpaPerformance.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">No claims imported yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
