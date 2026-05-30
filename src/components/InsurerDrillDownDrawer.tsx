import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import {
  Building2, Search, ExternalLink, FileText, AlertTriangle,
  TrendingDown, Filter, BarChart3, IndianRupee,
} from "lucide-react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatInr, formatInrShort, type Claim } from "@/data/mockClaims";
import { DENIED_STATUSES, SETTLED_STATUSES } from "@/lib/payerScorecard";

interface Props {
  insurerName: string | null;
  dimension: "insurer" | "tpa";
  allClaims: Claim[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type StatusBucket = "all" | "settled" | "denied" | "open";

function monthKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

const tooltipStyle = {
  fontSize: 11,
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
};

export default function InsurerDrillDownDrawer({
  insurerName, dimension, allClaims, open, onOpenChange,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusBucket>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const insurerClaims = useMemo(() => {
    if (!insurerName) return [];
    return allClaims.filter((c) => {
      const v = (dimension === "insurer" ? c.insurance_company_name : c.tpa_name) || "Unknown";
      return v === insurerName;
    });
  }, [insurerName, dimension, allClaims]);

  // Monthly aggregation for this insurer
  const monthly = useMemo(() => {
    const map = new Map<string, {
      month: string; billed: number; settled: number; outstanding: number;
      claims: number; denied: number;
    }>();
    for (const c of insurerClaims) {
      const k = monthKey(c.claim_creation_date);
      if (!k) continue;
      let e = map.get(k);
      if (!e) { e = { month: k, billed: 0, settled: 0, outstanding: 0, claims: 0, denied: 0 }; map.set(k, e); }
      e.billed += c.claimed_amount || 0;
      e.settled += c.settled_amount || 0;
      e.outstanding += c.outstanding_amount || 0;
      e.claims += 1;
      if (DENIED_STATUSES.has((c.claim_status || "").toLowerCase().trim())) e.denied += 1;
    }
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((e) => ({
        ...e,
        label: monthLabel(e.month),
        ncrPct: e.billed ? +((e.settled / e.billed) * 100).toFixed(1) : 0,
        denialPct: e.claims ? +((e.denied / e.claims) * 100).toFixed(1) : 0,
      }));
  }, [insurerClaims]);

  // KPIs
  const kpis = useMemo(() => {
    const billed = insurerClaims.reduce((s, c) => s + (c.claimed_amount || 0), 0);
    const settled = insurerClaims.reduce((s, c) => s + (c.settled_amount || 0), 0);
    const outstanding = insurerClaims.reduce((s, c) => s + (c.outstanding_amount || 0), 0);
    const denied = insurerClaims.filter((c) =>
      DENIED_STATUSES.has((c.claim_status || "").toLowerCase().trim()),
    ).length;
    return {
      claims: insurerClaims.length,
      billed, settled, outstanding,
      ncrPct: billed ? +((settled / billed) * 100).toFixed(1) : 0,
      denialPct: insurerClaims.length ? +((denied / insurerClaims.length) * 100).toFixed(1) : 0,
    };
  }, [insurerClaims]);

  const monthOptions = useMemo(() => monthly.map((m) => m.month), [monthly]);

  const filtered = useMemo(() => {
    let rows = insurerClaims;
    const q = search.toLowerCase().trim();
    if (q) {
      rows = rows.filter((c) =>
        (c.patient_name || "").toLowerCase().includes(q) ||
        (c.claim_number || "").toLowerCase().includes(q) ||
        (c.policy_holder_name || "").toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      rows = rows.filter((c) => {
        const s = (c.claim_status || "").toLowerCase().trim();
        if (statusFilter === "settled") return SETTLED_STATUSES.has(s);
        if (statusFilter === "denied") return DENIED_STATUSES.has(s);
        return (c.outstanding_amount || 0) > 0;
      });
    }
    if (monthFilter !== "all") {
      rows = rows.filter((c) => monthKey(c.claim_creation_date) === monthFilter);
    }
    return [...rows].sort((a, b) => (b.claimed_amount || 0) - (a.claimed_amount || 0));
  }, [insurerClaims, search, statusFilter, monthFilter]);

  if (!insurerName) return null;

  const resetFilters = () => { setSearch(""); setStatusFilter("all"); setMonthFilter("all"); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-4xl p-0 flex flex-col gap-0 overflow-hidden"
      >
        {/* Header */}
        <SheetHeader className="border-b bg-muted/30 px-5 py-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5 text-primary shrink-0" />
                <span className="truncate">{insurerName}</span>
                <Badge variant="outline" className="text-[9px] py-0 uppercase">
                  {dimension === "insurer" ? "Insurer" : "TPA"}
                </Badge>
              </SheetTitle>
              <p className="text-[11px] text-muted-foreground mt-1">
                {monthly.length} month{monthly.length === 1 ? "" : "s"} of activity · {kpis.claims} total claims
              </p>
            </div>
          </div>

          {/* Mini KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
            <MiniStat icon={<FileText className="h-3 w-3" />} label="Claims" value={kpis.claims.toString()} />
            <MiniStat icon={<IndianRupee className="h-3 w-3" />} label="Billed" value={formatInrShort(kpis.billed)} />
            <MiniStat
              icon={<TrendingDown className="h-3 w-3" />}
              label="NCR"
              value={`${kpis.ncrPct}%`}
              tone={kpis.ncrPct >= 75 ? "success" : kpis.ncrPct >= 50 ? "warning" : "destructive"}
            />
            <MiniStat
              icon={<AlertTriangle className="h-3 w-3" />}
              label="Denial"
              value={`${kpis.denialPct}%`}
              tone={kpis.denialPct > 15 ? "destructive" : "default"}
            />
            <MiniStat
              icon={<IndianRupee className="h-3 w-3" />}
              label="Outstanding"
              value={formatInrShort(kpis.outstanding)}
              tone={kpis.outstanding > 0 ? "destructive" : "default"}
            />
          </div>
        </SheetHeader>

        {/* Monthly chart */}
        <div className="border-b bg-background px-5 py-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            <BarChart3 className="h-3 w-3" />
            Monthly trend — billed, settled & NCR
          </div>
          <div className="h-44">
            {monthly.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No monthly data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthly} margin={{ top: 5, right: 10, bottom: 25, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={(v) => formatInrShort(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <RTooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, name: string) =>
                      name === "NCR %" || name === "Denial %" ? `${v}%` : formatInr(v)
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar yAxisId="left" dataKey="billed" name="Billed" fill="hsl(var(--foreground))" />
                  <Bar yAxisId="left" dataKey="settled" name="Settled" fill="hsl(var(--success))" />
                  <Line yAxisId="right" type="monotone" dataKey="ncrPct" name="NCR %" stroke="hsl(var(--warning))" strokeWidth={2} dot />
                  <Line yAxisId="right" type="monotone" dataKey="denialPct" name="Denial %" stroke="hsl(var(--destructive))" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Filter toolbar */}
        <div className="border-b bg-background px-5 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Filter className="h-3 w-3" />
              Filters
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-6 text-[10px]">
              Reset
            </Button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patient / claim..."
                className="h-8 pl-7 text-xs"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusBucket)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                <SelectItem value="open" className="text-xs">Open / Outstanding</SelectItem>
                <SelectItem value="settled" className="text-xs">Settled</SelectItem>
                <SelectItem value="denied" className="text-xs">Denied</SelectItem>
              </SelectContent>
            </Select>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All months</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">{monthLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
            <span>
              Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {insurerClaims.length} claims
            </span>
            <Link
              to={`/claims?${dimension === "insurer" ? "insurer" : "tpa"}=${encodeURIComponent(insurerName)}`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Open in Claims <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Claims list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 bg-muted/10">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">
              No claims match these filters.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((c) => {
                const status = (c.claim_status || "").toLowerCase().trim();
                const isDenied = DENIED_STATUSES.has(status);
                const isSettled = SETTLED_STATUSES.has(status);
                return (
                  <Card key={c.id} className="p-3 hover:border-primary/40 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground truncate">
                            {c.patient_name || "—"}
                          </span>
                          <Badge variant="outline" className="text-[9px] py-0 font-mono">
                            {c.claim_number || "no claim#"}
                          </Badge>
                          {isDenied && (
                            <Badge variant="destructive" className="text-[9px] py-0">Denied</Badge>
                          )}
                          {isSettled && !c.outstanding_amount && (
                            <Badge className="text-[9px] py-0 bg-success text-success-foreground border-transparent hover:bg-success/90">
                              Settled
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          {c.policy_holder_name && (
                            <>
                              <span>{c.policy_holder_name}</span>
                              <span>·</span>
                            </>
                          )}
                          {c.claim_creation_date && (
                            <span>Created {new Date(c.claim_creation_date).toLocaleDateString("en-IN")}</span>
                          )}
                          <span>·</span>
                          <span className="capitalize">{c.claim_status || "—"}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Billed</div>
                        <div className="text-sm font-semibold tabular-nums">{formatInrShort(c.claimed_amount || 0)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border/60">
                      <Mini label="Approved" value={formatInrShort(c.approved_amount || 0)} />
                      <Mini
                        label="Settled"
                        value={formatInrShort(c.settled_amount || 0)}
                        tone={c.settled_amount > 0 ? "success" : "default"}
                      />
                      <Mini
                        label="Outstanding"
                        value={formatInrShort(c.outstanding_amount || 0)}
                        tone={c.outstanding_amount > 0 ? "destructive" : "default"}
                      />
                    </div>

                    <div className="flex items-center justify-end mt-2 pt-2 border-t border-border/60 text-[10px]">
                      <Link
                        to={`/claims?claim=${encodeURIComponent(c.claim_number || c.id)}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Open claim <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MiniStat({
  icon, label, value, tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const valueCls: Record<string, string> = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };
  return (
    <div className="rounded border bg-background px-2 py-1.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${valueCls[tone]}`}>{value}</div>
    </div>
  );
}

function Mini({
  label, value, tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "destructive";
}) {
  const cls: Record<string, string> = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
  };
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xs font-medium tabular-nums ${cls[tone]}`}>{value}</div>
    </div>
  );
}
