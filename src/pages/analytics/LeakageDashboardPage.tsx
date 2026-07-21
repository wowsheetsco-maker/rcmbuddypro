import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { AlertTriangle, IndianRupee, TrendingDown, Download } from "lucide-react";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useGlobalFilter } from "@/components/global-filter-context";
import DateRangeQuickPicker from "@/components/DateRangeQuickPicker";
import { detectLeakage, totalLeakage, type LeakageBucket } from "@/lib/leakage";
import { formatInr } from "@/data/mockClaims";
import { cn } from "@/lib/utils";
import { useNavigate } from "@/lib/router-compat";

const SEV_TONE: Record<LeakageBucket["severity"], string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-border bg-muted text-muted-foreground",
};

export default function LeakageDashboardPage() {
  return (
    <AppLayout>
      <Inner />
    </AppLayout>
  );
}

function Inner() {
  const { claims, loading } = useLiveClaims();
  const { isWithin } = useGlobalFilter();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);

  const scoped = useMemo(
    () => claims.filter((c) => isWithin(c.claim_creation_date)),
    [claims, isWithin],
  );
  const buckets = useMemo(() => detectLeakage(scoped), [scoped]);
  const total = useMemo(() => totalLeakage(buckets), [buckets]);
  const active = buckets.find((b) => b.id === selected) ?? buckets[0];

  function exportCsv() {
    if (!active) return;
    const header = "Bucket,Claim,Patient,Payer,Amount,Age (days),Detail\n";
    const rows = active.rows.map(r =>
      [active.title, r.claimNumber, r.patient, r.payer, r.amount, r.ageDays, r.detail]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `leakage-${active.id}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingDown className="h-6 w-6 text-destructive" />
            Revenue Leakage Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Every ₹ already earned but at risk. Each detector maps to a specific recovery play.
          </p>
        </div>
        <DateRangeQuickPicker />
      </div>

      <KpiGrid>
        <KpiCard
          label="Total leakage flagged"
          value={formatInr(total.amount)}
          icon={<IndianRupee className="h-4 w-4" />}
          tone="denial"
          caption={`${total.claims} detections across ${buckets.filter(b=>b.claims>0).length} categories`}
        />
        <KpiCard
          label="Highest single category"
          value={buckets[0]?.claims ? formatInr(buckets[0].amount) : "—"}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="denial"
          caption={buckets[0]?.title ?? "No detections"}
        />
        <KpiCard
          label="Claims to review"
          value={total.claims.toLocaleString("en-IN")}
          caption="Sum across buckets (a claim may appear in >1)"
        />
        <KpiCard
          label="Data window"
          value={loading ? "…" : `${scoped.length}`}
          caption="Claims in current date filter"
        />
      </KpiGrid>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Leakage buckets</CardTitle></CardHeader>
          <CardContent className="space-y-1 p-2">
            {buckets.map(b => (
              <button
                key={b.id}
                onClick={() => setSelected(b.id)}
                className={cn(
                  "w-full text-left rounded-md border px-3 py-2 transition-colors",
                  (active?.id === b.id)
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:bg-muted",
                  b.claims === 0 && "opacity-50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-semibold truncate">{b.title}</div>
                  <Badge variant="outline" className={cn("shrink-0 text-[10px]", SEV_TONE[b.severity])}>
                    {b.severity}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>{b.claims} claims</span>
                  <span className="font-semibold text-foreground">{formatInr(b.amount)}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-sm">{active?.title ?? "Select a bucket"}</CardTitle>
              {active && <p className="text-xs text-muted-foreground mt-1">{active.description}</p>}
            </div>
            {active && active.rows.length > 0 && (
              <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {!active || active.rows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No claims match this detector in the selected window.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Age</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active.rows.slice(0, 200).map(r => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/claims?claim=${encodeURIComponent(r.claimNumber)}`)}>
                      <TableCell className="font-mono text-xs">{r.claimNumber}</TableCell>
                      <TableCell className="text-xs">{r.patient}</TableCell>
                      <TableCell className="text-xs">{r.payer}</TableCell>
                      <TableCell className="text-right text-xs font-semibold">{formatInr(r.amount)}</TableCell>
                      <TableCell className="text-right text-xs">{r.ageDays}d</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {active && active.rows.length > 200 && (
              <div className="p-2 text-center text-[11px] text-muted-foreground">
                Showing first 200 of {active.rows.length} — export CSV for the full list.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
