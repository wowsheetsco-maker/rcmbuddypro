import { useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import {
  Building2, Search, X, ExternalLink, Users, FileText, AlertTriangle,
  TrendingDown, Filter,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { formatInrShort, type Claim } from "@/data/mockClaims";
import { DENIED_STATUSES, SETTLED_STATUSES } from "@/lib/payerScorecard";
import { RISK_DOT, RISK_TONE, type CorporateStats } from "@/lib/corporateStats";

interface Props {
  corporate: CorporateStats | null;
  allClaims: Claim[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type StatusBucket = "all" | "settled" | "denied" | "open";
type AgingBucket = "all" | "d0_30" | "d31_60" | "d61_90" | "d90_plus";

function ageDays(claim: Claim): number {
  const ref = claim.payment_update_date || new Date().toISOString().slice(0, 10);
  const start = new Date(claim.claim_creation_date).getTime();
  const end = new Date(ref).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000);
}

function bucketFor(days: number): Exclude<AgingBucket, "all"> {
  if (days <= 30) return "d0_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

const BUCKET_LABEL: Record<Exclude<AgingBucket, "all">, string> = {
  d0_30: "0-30d",
  d31_60: "31-60d",
  d61_90: "61-90d",
  d90_plus: "90+d",
};

export default function CorporateDrillDownDrawer({
  corporate, allClaims, open, onOpenChange,
}: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusBucket>("all");
  const [agingFilter, setAgingFilter] = useState<AgingBucket>("all");
  const [tpaFilter, setTpaFilter] = useState<string>("all");

  const corporateClaims = useMemo(() => {
    if (!corporate) return [];
    const target = corporate.name.toLowerCase().trim();
    return allClaims.filter((c) => {
      const ph = (c.policy_holder_name || "").toLowerCase().trim();
      // Match the same UNKNOWN bucket logic used by buildCorporateStats
      if (!ph) return target.startsWith("⚠");
      return ph === target;
    });
  }, [corporate, allClaims]);

  const filtered = useMemo(() => {
    let rows = corporateClaims;
    const q = search.toLowerCase().trim();
    if (q) {
      rows = rows.filter((c) =>
        (c.patient_name || "").toLowerCase().includes(q) ||
        (c.claim_number || "").toLowerCase().includes(q) ||
        (c.member_customer_id || "").toLowerCase().includes(q) ||
        (c.tpa_name || "").toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      rows = rows.filter((c) => {
        const s = (c.claim_status || "").toLowerCase().trim();
        if (statusFilter === "settled") return SETTLED_STATUSES.has(s);
        if (statusFilter === "denied") return DENIED_STATUSES.has(s);
        // open
        return (c.outstanding_amount || 0) > 0;
      });
    }
    if (agingFilter !== "all") {
      rows = rows.filter((c) => {
        if ((c.outstanding_amount || 0) <= 0) return false;
        return bucketFor(ageDays(c)) === agingFilter;
      });
    }
    if (tpaFilter !== "all") {
      rows = rows.filter((c) => c.tpa_name === tpaFilter);
    }
    return [...rows].sort((a, b) => (b.outstanding_amount || 0) - (a.outstanding_amount || 0));
  }, [corporateClaims, search, statusFilter, agingFilter, tpaFilter]);

  const tpaOptions = useMemo(() => {
    const set = new Set<string>();
    corporateClaims.forEach((c) => c.tpa_name && set.add(c.tpa_name));
    return Array.from(set).sort();
  }, [corporateClaims]);

  if (!corporate) return null;

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setAgingFilter("all");
    setTpaFilter("all");
  };

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
                <span className="truncate">{corporate.name}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${RISK_TONE[corporate.risk]}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${RISK_DOT[corporate.risk]}`} />
                  {corporate.risk[0].toUpperCase() + corporate.risk.slice(1)}
                </span>
              </SheetTitle>
              <p className="text-[11px] text-muted-foreground mt-1">
                {corporate.tpas.length} TPA{corporate.tpas.length === 1 ? "" : "s"} · {corporate.insurers.length} insurer{corporate.insurers.length === 1 ? "" : "s"} · {corporate.uniqueMembers} member{corporate.uniqueMembers === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {/* Mini KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <MiniStat
              icon={<FileText className="h-3 w-3" />}
              label="Claims"
              value={corporate.claims.toString()}
            />
            <MiniStat
              icon={<TrendingDown className="h-3 w-3" />}
              label="NCR"
              value={`${corporate.ncrPct}%`}
              tone={corporate.ncrPct >= 75 ? "success" : corporate.ncrPct >= 50 ? "warning" : "destructive"}
            />
            <MiniStat
              icon={<AlertTriangle className="h-3 w-3" />}
              label="Denial"
              value={`${corporate.denialPct}%`}
              tone={corporate.denialPct > 15 ? "destructive" : "default"}
            />
            <MiniStat
              icon={<Users className="h-3 w-3" />}
              label="Outstanding"
              value={formatInrShort(corporate.outstanding)}
              tone={corporate.outstanding > 0 ? "destructive" : "default"}
            />
          </div>
        </SheetHeader>

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
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
            <Select value={agingFilter} onValueChange={(v) => setAgingFilter(v as AgingBucket)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Aging" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All ages</SelectItem>
                <SelectItem value="d0_30" className="text-xs">0-30 days</SelectItem>
                <SelectItem value="d31_60" className="text-xs">31-60 days</SelectItem>
                <SelectItem value="d61_90" className="text-xs">61-90 days</SelectItem>
                <SelectItem value="d90_plus" className="text-xs">90+ days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tpaFilter} onValueChange={setTpaFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="TPA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All TPAs</SelectItem>
                {tpaOptions.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
            <span>
              Showing <span className="font-semibold text-foreground">{filtered.length}</span> of {corporateClaims.length} claims
            </span>
            <Link
              to={`/claims?policyHolder=${encodeURIComponent(corporate.name)}`}
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
                const days = ageDays(c);
                const showAging = (c.outstanding_amount || 0) > 0;
                const bucket = showAging ? bucketFor(days) : null;
                const agingTone =
                  bucket === "d90_plus" ? "text-destructive border-destructive/40 bg-destructive/10"
                    : bucket === "d61_90" ? "text-warning border-warning/40 bg-warning/10"
                    : "text-muted-foreground border-border bg-muted/40";

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
                          {c.is_irdai_breach && (
                            <Badge variant="outline" className="text-[9px] py-0 border-destructive/50 text-destructive">
                              SLA 30d
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <span>{c.tpa_name || "—"}</span>
                          {c.member_customer_id && (
                            <>
                              <span>·</span>
                              <span className="font-mono">{c.member_customer_id}</span>
                            </>
                          )}
                          {c.claim_creation_date && (
                            <>
                              <span>·</span>
                              <span>Created {new Date(c.claim_creation_date).toLocaleDateString("en-IN")}</span>
                            </>
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

                    {showAging && bucket && (
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60 text-[10px]">
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 border ${agingTone}`}>
                          Aging · {BUCKET_LABEL[bucket]} ({days}d)
                        </span>
                        <Link
                          to={`/claims?claim=${encodeURIComponent(c.claim_number || c.id)}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Open claim <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </div>
                    )}
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
