import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "@/lib/router-compat";
import { Loader2, Flame, AlertTriangle, Clock, TrendingUp, Search, X as XIcon, Download } from "lucide-react";
import { exportClaimsCsv } from "@/lib/claimsCsv";
import type { FollowUpTone } from "@/components/BulkFollowUpComposer";
import RowActionButtons from "@/components/RowActionButtons";
import { Card } from "@/components/ui/card";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NumericCell, SortableTh, useUrlTableSort, SortStatusBar } from "@/components/ui/numeric-cell";
import AppLayout from "@/components/AppLayout";
import ClaimDrawer from "@/components/ClaimDrawer";
import BulkFollowUpComposer, { type ComposerTarget } from "@/components/BulkFollowUpComposer";
import WhatsAppComposerDialog from "@/components/WhatsAppComposerDialog";
import { ClaimsPagination } from "@/components/ui/claims-pagination";
import { type Claim, formatInr, formatDays, getStatusColor } from "@/data/mockClaims";
import { usePriorityWorklistPage, type PriorityBand } from "@/hooks/usePriorityWorklistPage";
import { useInsurerContacts, findContactForProvider } from "@/hooks/useInsurerContacts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SortKey = "score" | "outstanding" | "age";

/** Recompute the "Why this priority?" factors client-side from a claim row.
 *  The server view provides the authoritative score + band; this is presentation-only. */
function factorsFor(c: Claim): { factors: string[]; action: string; band: PriorityBand } {
  const factors: string[] = [];
  const amt = c.outstanding_amount ?? 0;
  if (amt >= 500_000) factors.push(`High ₹ ${formatInr(amt)}`);
  const days = c.days_since_claim ?? 0;
  if (days >= 90) factors.push(`Aging ${days}d (90+)`);
  else if (days >= 60) factors.push(`Aging ${days}d (60+)`);
  else if (days >= 30) factors.push(`Aging ${days}d (30+)`);
  if (c.is_irdai_breach) factors.push("SLA TAT breached");
  const s = (c.claim_status || "").toLowerCase();
  if (s.includes("denied") || s.includes("rejected")) factors.push("Denied / rejected");
  return { factors, action: "", band: "low" };
}

const BAND_STYLES: Record<PriorityBand, { chip: string; bar: string; label: string; icon: typeof Flame; action: string }> = {
  critical: { chip: "bg-destructive/15 text-destructive border-destructive/30", bar: "bg-destructive", label: "Critical", icon: Flame, action: "Escalate · call TPA SPOC" },
  high:     { chip: "bg-orange-500/15 text-orange-600 border-orange-500/30 dark:text-orange-400", bar: "bg-orange-500", label: "High", icon: AlertTriangle, action: "Send urgent reminder" },
  medium:   { chip: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400", bar: "bg-amber-500", label: "Medium", icon: Clock, action: "Schedule follow-up" },
  low:      { chip: "bg-muted text-muted-foreground border-border", bar: "bg-muted-foreground/40", label: "Low", icon: TrendingUp, action: "Monitor" },
};

export default function PriorityWorklistPage() {
  const { contacts } = useInsurerContacts();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [band, setBand] = useState<PriorityBand | "all">(() => (searchParams.get("band") as PriorityBand | "all") || "all");
  const [page, setPage] = useState(() => Math.max(0, Number(searchParams.get("page") ?? 0)));
  const [pageSize, setPageSize] = useState(() => Number(searchParams.get("size") ?? 25));

  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  // Composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTarget, setComposerTarget] = useState<ComposerTarget | null>(null);
  const [composerTone, setComposerTone] = useState<FollowUpTone>("formal");
  const [waRole, setWaRole] = useState<string>("billing");
  const [waOpen, setWaOpen] = useState(false);
  const [waCtx, setWaCtx] = useState<{
    claimId: string;
    recipient: string | null;
    recipientLabel: string;
    context: {
      patient_name: string | null;
      claim_number: string | null;
      hospital_name: string | null;
      outstanding_amount: number | null;
      days_since_claim: number | null;
      tpa_name: string | null;
      tpa_spoc_name: string | null;
      insurance_company_name: string | null;
      last_communication_note: string | null;
    };
  } | null>(null);

  const SORT_KEYS = ["score", "outstanding", "age"] as const;
  const SORT_LABELS: Record<SortKey, string> = { score: "Priority Score", outstanding: "Outstanding", age: "Age" };
  const { sort, toggle, clear } = useUrlTableSort<SortKey>(SORT_KEYS, {
    initial: { key: "score", dir: "desc" },
  });

  // Reset to first page when filters/sort change
  useEffect(() => { setPage(0); }, [search, band, sort.key, sort.dir, pageSize]);

  // Persist filter state in URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (page > 0) next.set("page", String(page)); else next.delete("page");
    if (pageSize !== 25) next.set("size", String(pageSize)); else next.delete("size");
    if (search) next.set("q", search); else next.delete("q");
    if (band !== "all") next.set("band", band); else next.delete("band");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, band]);

  // Server-side: age desc means oldest first → claim_creation_date asc.
  const effectiveDir: "asc" | "desc" = sort.dir ?? "desc";
  const sortKey: SortKey = (sort.key as SortKey) ?? "score";
  const sortDir: "asc" | "desc" = sortKey === "age"
    ? (effectiveDir === "desc" ? "asc" : "desc")
    : effectiveDir;

  const { rows, totalCount, totalPages, counts, loading, countsLoading, error } = usePriorityWorklistPage({
    band,
    search,
    sort: sortKey,
    dir: sortDir,
    page,
    pageSize,
  });

  const openEmail = (claim: Claim, tone: FollowUpTone = "formal") => {
    const contact = findContactForProvider(contacts, claim.tpa_name || claim.insurance_company_name || "");
    setComposerTone(tone);
    setComposerTarget({
      insurerName: claim.tpa_name || claim.insurance_company_name || "Unknown TPA",
      recipientEmail: contact?.email ?? "",
      ccEmails: contact?.cc_emails ?? "",
      whatsapp: contact?.whatsapp ?? null,
      claims: [claim],
    });
    setComposerOpen(true);
  };

  const openWhatsApp = (claim: Claim, role: string = "billing") => {
    const contact = findContactForProvider(contacts, claim.tpa_name || claim.insurance_company_name || "");
    setWaRole(role);
    setWaCtx({
      claimId: claim.id,
      recipient: contact?.whatsapp ?? null,
      recipientLabel: `${claim.tpa_name || "TPA"} · WhatsApp`,
      context: {
        patient_name: claim.patient_name ?? null,
        claim_number: claim.claim_number ?? null,
        hospital_name: claim.hospital_name ?? null,
        outstanding_amount: claim.outstanding_amount ?? null,
        days_since_claim: claim.days_since_claim ?? null,
        tpa_name: claim.tpa_name ?? null,
        tpa_spoc_name: contact?.contact_name ?? null,
        insurance_company_name: claim.insurance_company_name ?? null,
        last_communication_note: claim.last_communication_note ?? null,
      },
    });
    setWaOpen(true);
  };

  const openCall = (claim: Claim) => {
    const contact = findContactForProvider(contacts, claim.tpa_name || claim.insurance_company_name || "");
    const num = contact?.phone || contact?.whatsapp;
    if (!num) {
      toast.error(`No phone number on file for ${claim.tpa_name || "this TPA"}`, {
        description: "Add a phone number in Settings → Contacts.",
      });
      return;
    }
    window.location.href = `tel:${num.replace(/\s+/g, "")}`;
    toast.success(`Calling ${contact?.contact_name || claim.tpa_name} · ${num}`);
  };

  const bandChips: Array<PriorityBand | "all"> = useMemo(() => ["all", "critical", "high", "medium", "low"], []);

  return (
    <AppLayout>
      <TooltipProvider delayDuration={200}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-display text-foreground">Priority Worklist</h1>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                {counts.totalRows} claims ranked by priority score
                {(loading || countsLoading) && <Loader2 className="h-3 w-3 animate-spin" />}
                {error && <Badge variant="outline" className="text-[9px] py-0 border-destructive/40 text-destructive">{error}</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px]">
                {bandChips.map((b) => {
                  const active = band === b;
                  const s = b === "all" ? null : BAND_STYLES[b];
                  const label = b === "all" ? "All" : s!.label;
                  const count = b === "all" ? counts.totalRows : counts[b];
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBand(b)}
                      className={cn(
                        "h-6 px-2 rounded-md border text-[11px] font-semibold transition-colors",
                        active ? "bg-foreground text-background border-foreground" : s ? s.chip : "bg-muted text-muted-foreground border-border",
                      )}
                    >
                      {label} · {count}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={rows.length === 0}
                onClick={() => exportClaimsCsv(rows.map((r) => r.claim), "priority-worklist")}
              >
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </div>
          </div>

          <KpiGrid cols={4}>
            <KpiCard
              label="Critical priority"
              value={counts.critical}
              tone="denial"
              loading={countsLoading}
              empty={!countsLoading && counts.critical === 0}
              icon={<Flame className="h-3.5 w-3.5 text-destructive" />}
              caption="Action today"
            />
            <KpiCard
              label="High priority"
              value={counts.high}
              loading={countsLoading}
              empty={!countsLoading && counts.high === 0}
              icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" />}
              caption="Action this week"
            />
            <KpiCard
              label="Total outstanding"
              value={formatInr(counts.totalOutstanding)}
              loading={countsLoading}
              empty={!countsLoading && counts.totalOutstanding === 0}
              icon={<TrendingUp className="h-3.5 w-3.5 text-primary" />}
              caption={`${counts.totalRows} open claim(s)`}
            />
            <KpiCard
              label="SLA breaches"
              value={counts.slaBreaches}
              tone="denial"
              loading={countsLoading}
              empty={!countsLoading && counts.slaBreaches === 0}
              icon={<Clock className="h-3.5 w-3.5 text-destructive" />}
              caption=">15 days outstanding"
            />
          </KpiGrid>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search claim no, patient, TPA…"
                className="h-8 pl-7 pr-7 text-xs"
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <SortStatusBar sort={sort} onClear={clear} labels={SORT_LABELS} />

          <Card className="shadow-sm overflow-hidden">
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead priority="primary" className="w-8 h-9 px-2"><Checkbox /></TableHead>
                  <SortableTh sortKey="score" sortState={sort} onSort={toggle} priority="primary" className="h-9 px-2 text-[11px]">Priority</SortableTh>
                  <TableHead priority="secondary" className="h-9 px-2 text-[11px]">Claim No</TableHead>
                  <TableHead priority="primary" className="h-9 px-2 text-[11px]">Patient</TableHead>
                  <TableHead priority="tertiary" className="h-9 px-2 text-[11px]">TPA</TableHead>
                  <TableHead priority="tertiary" className="h-9 px-2 text-[11px]">Status</TableHead>
                  <SortableTh sortKey="outstanding" sortState={sort} onSort={toggle} priority="primary" className="h-9 px-2 text-[11px]">Outstanding</SortableTh>
                  <SortableTh sortKey="age" sortState={sort} onSort={toggle} priority="secondary" className="h-9 px-2 text-[11px]">Age</SortableTh>
                  <TableHead priority="primary" className="h-9 px-2 text-[11px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8 text-xs">
                      No claims match the current filters.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(({ claim, score, band: rowBand }) => {
                  const s = BAND_STYLES[rowBand];
                  const SIcon = s.icon;
                  const { factors } = factorsFor(claim);
                  return (
                    <TableRow key={claim.id} className="cursor-pointer" onClick={() => setSelectedClaim(claim)}>
                      <TableCell priority="primary" className="px-2 py-1.5"><Checkbox onClick={(e) => e.stopPropagation()} /></TableCell>
                      <TableCell priority="primary" className="px-2 py-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex flex-col items-start gap-1">
                              <Badge variant="outline" className={cn("h-4 px-1 text-[10px] font-semibold gap-1", s.chip)}>
                                <SIcon className="h-2.5 w-2.5" />
                                {s.label} · {score}
                              </Badge>
                              <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                                <div className={cn("h-full rounded-full", s.bar)} style={{ width: `${score}%` }} />
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <div className="text-[11px] font-semibold mb-1">Why this priority?</div>
                            <ul className="text-[11px] space-y-0.5 list-disc pl-4">
                              {factors.length === 0 ? <li>Low overall risk</li> : factors.map((f) => <li key={f}>{f}</li>)}
                            </ul>
                            <div className="text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t">
                              Suggested: <strong>{s.action}</strong>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell priority="secondary" className="px-2 py-1.5 font-mono text-[11px]">{claim.claim_number}</TableCell>
                      <TableCell priority="primary" className="px-2 py-1.5 text-[11px]">{claim.patient_name}</TableCell>
                      <TableCell priority="tertiary" className="px-2 py-1.5 text-[11px] text-muted-foreground truncate max-w-[140px]" title={claim.tpa_name}>{claim.tpa_name}</TableCell>
                      <TableCell priority="tertiary" className="px-2 py-1.5"><Badge className={`text-[9px] px-1 h-4 ${getStatusColor(claim.claim_status)}`}>{claim.claim_status}</Badge></TableCell>
                      <NumericCell priority="primary" bold className="px-2 py-1.5 text-[11px]">{formatInr(claim.outstanding_amount)}</NumericCell>
                      <NumericCell priority="secondary" className="px-2 py-1.5 text-[11px]">{formatDays(claim.days_since_claim)}</NumericCell>
                      <TableCell priority="primary" className="px-2 py-1.5">
                        <RowActionButtons
                          onEmail={(tone) => openEmail(claim, tone)}
                          onWhatsApp={(role) => openWhatsApp(claim, role)}
                          onCall={() => openCall(claim)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <ClaimsPagination
              page={page}
              pageSize={pageSize}
              totalCount={totalCount}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </Card>
        </div>
        {selectedClaim && <ClaimDrawer claim={selectedClaim} onClose={() => setSelectedClaim(null)} />}

        <BulkFollowUpComposer
          open={composerOpen}
          onOpenChange={setComposerOpen}
          target={composerTarget}
          hospitalName="My Hospital"
          defaultTone={composerTone}
        />

        <WhatsAppComposerDialog
          open={waOpen}
          onOpenChange={setWaOpen}
          claimId={waCtx?.claimId ?? ""}
          recipient={waCtx?.recipient ?? null}
          recipientLabel={waCtx?.recipientLabel}
          defaultRole={waRole}
          context={waCtx?.context ?? {
            patient_name: null, claim_number: null, hospital_name: null,
            outstanding_amount: null, days_since_claim: null, tpa_name: null,
            tpa_spoc_name: null, insurance_company_name: null, last_communication_note: null,
          }}
        />
      </TooltipProvider>
    </AppLayout>
  );
}
