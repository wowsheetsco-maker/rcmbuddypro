import { useMemo, useState, useEffect } from "react";
import { Loader2, ShieldAlert, TrendingDown, Percent, RefreshCcw, Save, Search, X as XIcon, Download } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { formatInr, type Claim } from "@/data/mockClaims";
import ClaimDrawer from "@/components/ClaimDrawer";
import { exportClaimsCsv } from "@/lib/claimsCsv";
import {
  computeAlerts,
  loadAlertConfig,
  saveAlertConfig,
  ALERT_LABELS,
  type ReconciliationAlertConfig,
  type AlertKind,
  type AlertSeverity,
} from "@/lib/reconciliationAlerts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SEV_STYLE: Record<AlertSeverity, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

const KIND_STYLE: Record<AlertKind, string> = {
  settlement_short: "bg-destructive/10 text-destructive border-destructive/30",
  tds_excess: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  unsettled_paid: "bg-primary/10 text-primary border-primary/30",
};

export default function ReconciliationAlertsPage() {
  const { claims, loading, isMock } = useLiveClaims();
  const [config, setConfig] = useState<ReconciliationAlertConfig>(() => loadAlertConfig());
  const [draft, setDraft] = useState<ReconciliationAlertConfig>(config);
  const [kindFilter, setKindFilter] = useState<AlertKind | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Claim | null>(null);

  useEffect(() => setDraft(config), [config]);

  const alerts = useMemo(() => computeAlerts(claims, config), [claims, config]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return alerts.filter((a) => {
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (!needle) return true;
      const c = a.claim;
      return [c.claim_number, c.patient_name, c.tpa_name, c.insurance_company_name]
        .some((v) => (v || "").toLowerCase().includes(needle));
    });
  }, [alerts, kindFilter, search]);

  const totalGap = filtered.reduce((s, a) => s + a.gap, 0);
  const byKind = useMemo(() => {
    const m: Record<AlertKind, number> = { settlement_short: 0, tds_excess: 0, unsettled_paid: 0 };
    for (const a of alerts) m[a.kind] += 1;
    return m;
  }, [alerts]);
  const highSeverity = alerts.filter((a) => a.severity === "high").length;

  const applyConfig = () => {
    saveAlertConfig(draft);
    setConfig(draft);
    toast.success("Alert rules updated");
  };

  const resetConfig = () => {
    const defaults = { shortfallTolerancePct: 2, expectedTdsPct: 10, minShortfallInr: 500 };
    setDraft(defaults);
    saveAlertConfig(defaults);
    setConfig(defaults);
    toast.info("Rules reset to defaults");
  };

  const exportAlerts = () => {
    if (filtered.length === 0) return;
    exportClaimsCsv(filtered.map((a) => a.claim), "reconciliation-alerts");
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" /> Reconciliation Alerts
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              Automatic checks on settled claims for short payments and TDS anomalies · {alerts.length} open
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {isMock && !loading && <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportAlerts} disabled={filtered.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
        </div>

        <KpiGrid cols={4}>
          <KpiCard
            label="Open alerts"
            value={alerts.length}
            tone={highSeverity > 0 ? "denial" : undefined}
            loading={loading}
            empty={!loading && alerts.length === 0}
            icon={<ShieldAlert className="h-3.5 w-3.5 text-destructive" />}
          />
          <KpiCard
            label="High severity"
            value={highSeverity}
            tone="denial"
            loading={loading}
            empty={!loading && highSeverity === 0}
            icon={<TrendingDown className="h-3.5 w-3.5 text-destructive" />}
          />
          <KpiCard
            label="₹ variance detected"
            value={formatInr(totalGap)}
            loading={loading}
            empty={!loading && totalGap === 0}
            icon={<Percent className="h-3.5 w-3.5 text-warning" />}
          />
          <KpiCard
            label="Short payments"
            value={byKind.settlement_short}
            loading={loading}
            empty={!loading && byKind.settlement_short === 0}
            icon={<TrendingDown className="h-3.5 w-3.5 text-primary" />}
          />
        </KpiGrid>

        <Card className="p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Alert rules</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-[11px]">Shortfall tolerance</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={draft.shortfallTolerancePct}
                      onChange={(e) => setDraft({ ...draft, shortfallTolerancePct: Number(e.target.value) || 0 })}
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Flag if settled + TDS falls this much below approved.</p>
                </div>
                <div>
                  <Label className="text-[11px]">Expected TDS rate</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={draft.expectedTdsPct}
                      onChange={(e) => setDraft({ ...draft, expectedTdsPct: Number(e.target.value) || 0 })}
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Anything above this on a settled claim is flagged.</p>
                </div>
                <div>
                  <Label className="text-[11px]">Minimum ₹ to alert</Label>
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={draft.minShortfallInr}
                    onChange={(e) => setDraft({ ...draft, minShortfallInr: Number(e.target.value) || 0 })}
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Filters out small rounding differences.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={resetConfig} className="gap-1.5">
                <RefreshCcw className="h-3.5 w-3.5" /> Reset
              </Button>
              <Button size="sm" onClick={applyConfig} className="gap-1.5">
                <Save className="h-3.5 w-3.5" /> Save &amp; re-scan
              </Button>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            {(["all", "settlement_short", "tds_excess", "unsettled_paid"] as const).map((k) => {
              const active = kindFilter === k;
              const count = k === "all" ? alerts.length : byKind[k as AlertKind];
              const label = k === "all" ? "All" : ALERT_LABELS[k as AlertKind];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={cn(
                    "h-6 px-2 rounded-md border text-[11px] font-semibold transition-colors",
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "bg-muted text-muted-foreground border-border hover:bg-accent",
                  )}
                >
                  {label} · {count}
                </button>
              );
            })}
          </div>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search claim, patient, TPA…"
              className="h-8 pl-7 pr-7 text-xs"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label="Clear"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <Card className="shadow-sm">
          <Table dense wrapperClassName="max-h-[calc(100vh-500px)]">
            <TableHeader sticky>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead priority="secondary">Payer</TableHead>
                <TableHead>Alert</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead align="right">Expected</TableHead>
                <TableHead align="right">Actual</TableHead>
                <TableHead align="right">Gap</TableHead>
                <TableHead priority="tertiary">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={`${a.claim.id}-${a.kind}`} className="cursor-pointer" onClick={() => setSelected(a.claim)}>
                  <TableCell className="font-mono text-[11px]">{a.claim.claim_number}</TableCell>
                  <TableCell>{a.claim.patient_name}</TableCell>
                  <TableCell priority="secondary" className="text-muted-foreground truncate max-w-[160px]">
                    {a.claim.tpa_name || a.claim.insurance_company_name || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("h-4 px-1 text-[10px] font-semibold", KIND_STYLE[a.kind])}>
                      {ALERT_LABELS[a.kind]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("h-4 px-1 text-[10px] font-semibold uppercase", SEV_STYLE[a.severity])}>
                      {a.severity}
                    </Badge>
                  </TableCell>
                  <TableCell numeric>{formatInr(a.expected)}</TableCell>
                  <TableCell numeric>{formatInr(a.actual)}</TableCell>
                  <TableCell numeric className="font-semibold text-destructive">{formatInr(a.gap)}</TableCell>
                  <TableCell priority="tertiary" className="text-[11px] text-muted-foreground max-w-[280px] truncate" title={a.reason}>
                    {a.reason}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6 text-muted-foreground text-xs">
                    All settlements reconcile within tolerance. Nothing to flag.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {selected && <ClaimDrawer claim={selected} onClose={() => setSelected(null)} />}
    </AppLayout>
  );
}
