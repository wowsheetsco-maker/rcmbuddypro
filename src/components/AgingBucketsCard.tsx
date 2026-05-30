import { useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, AlertTriangle, Clock, IndianRupee, ArrowRight, Download, X } from "lucide-react";
import { formatInrShort, formatDays } from "@/data/mockClaims";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import type { Claim } from "@/data/mockClaims";
import { toast } from "sonner";

const SETTLED = new Set(["settled", "paid", "closed"]);

interface BucketDef {
  id: "0-30" | "31-60" | "61-90" | "90+";
  label: string;
  min: number;
  max: number;
  tone: string;
  border: string;
  text: string;
}

const BUCKETS: BucketDef[] = [
  { id: "0-30",  label: "0–30 days",  min: 0,  max: 30,        tone: "bg-success/10",     border: "border-success/30",     text: "text-success" },
  { id: "31-60", label: "31–60 days", min: 31, max: 60,        tone: "bg-primary/10",     border: "border-primary/30",     text: "text-primary" },
  { id: "61-90", label: "61–90 days", min: 61, max: 90,        tone: "bg-warning/15",     border: "border-warning/40",     text: "text-warning" },
  { id: "90+",   label: "90+ days",   min: 91, max: Infinity,  tone: "bg-destructive/10", border: "border-destructive/40", text: "text-destructive" },
];

interface BucketRow {
  def: BucketDef;
  count: number;
  amount: number;
  pctOfTotal: number;
  claims: Claim[];
}

const ALL = "__all__";

/** CSV-safe escape — wraps cells with quotes if they contain , " or newline. */
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AgingBucketsCard() {
  const navigate = useNavigate();
  const { claims, loading } = useLiveClaims();
  const [drillBucket, setDrillBucket] = useState<BucketRow | null>(null);

  // Drill-down filters
  const [tpaFilter, setTpaFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [minAmt, setMinAmt] = useState<string>("");
  const [maxAmt, setMaxAmt] = useState<string>("");

  function resetFilters() {
    setTpaFilter(ALL);
    setStatusFilter(ALL);
    setMinAmt("");
    setMaxAmt("");
  }

  function openBucket(r: BucketRow) {
    resetFilters();
    setDrillBucket(r);
  }

  const { rows, totalAmount, totalCount } = useMemo(() => {
    const open = claims.filter((c) => !SETTLED.has((c.claim_status || "").toLowerCase()));

    const init: BucketRow[] = BUCKETS.map((def) => ({
      def, count: 0, amount: 0, pctOfTotal: 0, claims: [],
    }));

    let total = 0;
    for (const c of open) {
      const days = c.days_since_claim || 0;
      const out = Number(c.outstanding_amount || 0);
      const bucket = init.find((b) => days >= b.def.min && days <= b.def.max);
      if (!bucket) continue;
      bucket.count += 1;
      bucket.amount += out;
      bucket.claims.push(c);
      total += out;
    }
    for (const r of init) r.pctOfTotal = total > 0 ? (r.amount / total) * 100 : 0;
    for (const r of init) r.claims.sort((a, b) => Number(b.outstanding_amount || 0) - Number(a.outstanding_amount || 0));

    return { rows: init, totalAmount: total, totalCount: open.length };
  }, [claims]);

  // Distinct filter options scoped to the bucket the user is drilling into
  const filterOptions = useMemo(() => {
    if (!drillBucket) return { tpas: [], statuses: [] };
    const tpas = new Set<string>();
    const statuses = new Set<string>();
    for (const c of drillBucket.claims) {
      if (c.tpa_name) tpas.add(c.tpa_name);
      if (c.claim_status) statuses.add(c.claim_status);
    }
    return {
      tpas: Array.from(tpas).sort(),
      statuses: Array.from(statuses).sort(),
    };
  }, [drillBucket]);

  // Apply filters to drill-down list
  const filteredClaims = useMemo(() => {
    if (!drillBucket) return [];
    const min = minAmt ? Number(minAmt) : null;
    const max = maxAmt ? Number(maxAmt) : null;
    return drillBucket.claims.filter((c) => {
      if (tpaFilter !== ALL && c.tpa_name !== tpaFilter) return false;
      if (statusFilter !== ALL && c.claim_status !== statusFilter) return false;
      const out = Number(c.outstanding_amount || 0);
      if (min != null && !Number.isNaN(min) && out < min) return false;
      if (max != null && !Number.isNaN(max) && out > max) return false;
      return true;
    });
  }, [drillBucket, tpaFilter, statusFilter, minAmt, maxAmt]);

  const filteredAmount = useMemo(
    () => filteredClaims.reduce((s, c) => s + Number(c.outstanding_amount || 0), 0),
    [filteredClaims],
  );
  const isFiltered =
    tpaFilter !== ALL || statusFilter !== ALL || minAmt !== "" || maxAmt !== "";

  function handleExport() {
    if (!drillBucket || filteredClaims.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const header = [
      "Claim Number", "Patient", "TPA", "Insurer", "Hospital",
      "Status", "Days Since Claim", "Outstanding (INR)", "Claimed (INR)",
      "Approved (INR)", "Claim Date", "SLA Breach",
    ];
    const body = filteredClaims.map((c) => [
      c.claim_number,
      c.patient_name,
      c.tpa_name ?? "",
      c.insurance_company_name ?? "",
      c.hospital_name ?? "",
      c.claim_status,
      c.days_since_claim ?? "",
      Number(c.outstanding_amount || 0),
      Number(c.claimed_amount || 0),
      Number(c.approved_amount || 0),
      c.claim_creation_date ?? "",
      c.is_irdai_breach ? "Yes" : "No",
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`aging-${drillBucket.def.id}-${stamp}.csv`, [header, ...body.map((r) => r.map(String))]);
    toast.success(`Exported ${filteredClaims.length} claims`);
  }

  return (
    <>
      <Card className="shadow-sm border">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Accounts Receivable by Ageing
              {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {totalCount.toLocaleString("en-IN")} open claims · {formatInrShort(totalAmount)} outstanding
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-8"
            onClick={() => navigate("/analytics/cash-flow")}
          >
            Cash flow forecast <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {rows.map((r) => {
              const isCritical = r.def.id === "90+" && r.count > 0;
              return (
                <button
                  key={r.def.id}
                  type="button"
                  onClick={() => openBucket(r)}
                  disabled={r.count === 0}
                  className={`text-left rounded-lg border-2 ${r.def.border} ${r.def.tone} p-3 transition-all hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:shadow-none disabled:hover:translate-y-0 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                  aria-label={`Drill into ${r.def.label} bucket — ${r.count} claims`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-semibold uppercase tracking-wide ${r.def.text}`}>
                      {r.def.label}
                    </span>
                    {isCritical && <AlertTriangle className={`h-3.5 w-3.5 ${r.def.text}`} />}
                  </div>
                  <div className="text-xl font-bold tabular-nums text-foreground">
                    {formatInrShort(r.amount)}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-muted-foreground">
                      {r.count.toLocaleString("en-IN")} claims
                    </span>
                    <Badge variant="outline" className={`text-[10px] py-0 px-1.5 h-4 ${r.def.text} border-current`}>
                      {r.pctOfTotal.toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-background/60 overflow-hidden">
                    <div
                      className={`h-full ${r.def.text.replace("text-", "bg-")}`}
                      style={{ width: `${Math.min(100, r.pctOfTotal)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Drill-down dialog */}
      <Dialog open={!!drillBucket} onOpenChange={(o) => !o && setDrillBucket(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4" />
              Claims aged {drillBucket?.def.label}
            </DialogTitle>
            <DialogDescription>
              {drillBucket && (
                <>
                  {isFiltered ? (
                    <>
                      <strong>{filteredClaims.length.toLocaleString("en-IN")}</strong> of {drillBucket.count.toLocaleString("en-IN")} claims · <strong>{formatInrShort(filteredAmount)}</strong> of {formatInrShort(drillBucket.amount)} ({drillBucket.pctOfTotal.toFixed(1)}% of total AR)
                    </>
                  ) : (
                    <>
                      {drillBucket.count.toLocaleString("en-IN")} open claims worth{" "}
                      <strong>{formatInrShort(drillBucket.amount)}</strong> ({drillBucket.pctOfTotal.toFixed(1)}% of total AR)
                    </>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Filter row */}
          {drillBucket && (
            <div className="flex flex-wrap items-end gap-2 border-b pb-3">
              <div className="min-w-[160px]">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">TPA</Label>
                <Select value={tpaFilter} onValueChange={setTpaFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL} className="text-xs">All TPAs ({filterOptions.tpas.length})</SelectItem>
                    {filterOptions.tpas.map((t) => (
                      <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[140px]">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL} className="text-xs">All statuses</SelectItem>
                    {filterOptions.statuses.map((s) => (
                      <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[110px]">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Min ₹</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={minAmt}
                  onChange={(e) => setMinAmt(e.target.value)}
                  placeholder="0"
                  className="h-8 text-xs"
                />
              </div>
              <div className="w-[110px]">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Max ₹</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={maxAmt}
                  onChange={(e) => setMaxAmt(e.target.value)}
                  placeholder="∞"
                  className="h-8 text-xs"
                />
              </div>
              {isFiltered && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs">
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExport}
                  disabled={filteredClaims.length === 0}
                  className="h-8 text-xs"
                >
                  <Download className="h-3 w-3 mr-1.5" />
                  Export CSV ({filteredClaims.length})
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background border-b">
                <tr>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Claim</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Patient</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">TPA</th>
                  <th className="text-left py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Age</th>
                  <th className="text-right py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {filteredClaims.length === 0 && drillBucket && (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-xs text-muted-foreground">
                      No claims match the current filters.
                    </td>
                  </tr>
                )}
                {filteredClaims.slice(0, 200).map((c) => (
                  <tr
                    key={c.id}
                    className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      setDrillBucket(null);
                      navigate(`/claims?claim=${encodeURIComponent(c.claim_number)}`);
                    }}
                  >
                    <td className="py-2 font-mono text-xs">{c.claim_number}</td>
                    <td className="py-2 truncate max-w-[180px]">{c.patient_name}</td>
                    <td className="py-2 text-xs text-muted-foreground truncate max-w-[140px]">{c.tpa_name}</td>
                    <td className="py-2 text-xs capitalize text-muted-foreground">{c.claim_status}</td>
                    <td className="py-2 text-right tabular-nums">
                      {c.is_irdai_breach && <AlertTriangle className="h-3 w-3 text-destructive inline mr-1" />}
                      {formatDays(c.days_since_claim)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatInrShort(c.outstanding_amount)}</td>
                  </tr>
                ))}
                {filteredClaims.length > 200 && (
                  <tr>
                    <td colSpan={6} className="text-center py-3 text-xs text-muted-foreground">
                      Showing top 200 of {filteredClaims.length} · use Export CSV for the full filtered list
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
