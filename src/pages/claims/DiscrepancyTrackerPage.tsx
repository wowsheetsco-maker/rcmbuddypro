// Discrepancy Tracker — main page
// =================================
// Shows all settled/closed claims where Approved − (Settled + TDS) > threshold,
// based on configurable DQ rules (₹ + % bands). Supports two stages:
//   • Discrepancy   — flagged short-payments awaiting action
//   • Appeal Manager — claims escalated to appeal
//
// Per-row actions: open Action Drawer (Email · WhatsApp · Schedule · Push to Appeal)
// Bulk actions:    Send consolidated email per TPA with XLSX attachment
//                  Push to Appeal Manager (move stage)
//                  Export to Excel (TODO via existing smartReportExcel)

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRightCircle, Download, Filter, Loader2,
  RefreshCcw, Search, ShieldAlert, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NumericCell, SortableTh, useUrlTableSort, applyNumericSort, SortStatusBar } from "@/components/ui/numeric-cell";
import { Metric } from "@/components/ui/metric";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { RcmIcons } from "@/lib/icons";
import RowActionButtons from "@/components/RowActionButtons";
import BulkFollowUpComposer, { type ComposerTarget, type FollowUpTone } from "@/components/BulkFollowUpComposer";
import WhatsAppComposerDialog from "@/components/WhatsAppComposerDialog";
import { findContactForProvider } from "@/hooks/useInsurerContacts";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import DiscrepancyActionDrawer from "@/components/DiscrepancyActionDrawer";
import DiscrepancyBulkComposer, {
  type DiscrepancyBulkRow,
} from "@/components/DiscrepancyBulkComposer";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useDqRules } from "@/hooks/useDqRules";
import { useInsurerContacts } from "@/hooks/useInsurerContacts";
import {
  BAND_META, computeDiscrepancy, inrShort,
  type DiscrepancyBand, type DiscrepancyMetrics,
} from "@/lib/discrepancy";
import { supabase } from "@/integrations/supabase/client";
import { exportDiscrepancyXlsx } from "@/lib/discrepancyExport";
import type { Claim } from "@/data/mockClaims";

type SortKey = "amount" | "approved" | "settled" | "pct";

type Stage = "discrepancy" | "appeal";

interface ActionRow {
  claim_id: string;
  stage: string;
  status: string;
  last_action_type: string | null;
  last_action_at: string | null;
  email_sent_count: number;
  pushed_to_appeal_at: string | null;
}

interface FlaggedRow {
  claim: Claim;
  metrics: DiscrepancyMetrics;
  action?: ActionRow;
}

export default function DiscrepancyTrackerPage() {
  const { claims, loading, isMock, refetch } = useLiveClaims();
  const { rules } = useDqRules();
  const { contacts } = useInsurerContacts();

  const [stage, setStage] = useState<Stage>("discrepancy");
  const [search, setSearch] = useState("");
  const [tpaFilter, setTpaFilter] = useState<string>("all");
  const [bandFilter, setBandFilter] = useState<string>("all");
  const [actions, setActions] = useState<Record<string, ActionRow>>({});
  const [actionsLoading, setActionsLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerClaim, setDrawerClaim] = useState<Claim | null>(null);
  const [drawerMetrics, setDrawerMetrics] = useState<DiscrepancyMetrics | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<DiscrepancyBulkRow[]>([]);
  const [pushBusy, setPushBusy] = useState(false);

  // Single-row composers (email / whatsapp) — same UX as Priority Worklist
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTarget, setComposerTarget] = useState<ComposerTarget | null>(null);
  const [composerTone, setComposerTone] = useState<FollowUpTone>("formal");
  const [waOpen, setWaOpen] = useState(false);
  const [waRole, setWaRole] = useState<string>("billing");
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

  const SORT_KEYS = ["amount", "approved", "settled", "pct"] as const;
  const SORT_LABELS: Record<SortKey, string> = {
    amount: "Discrepancy",
    approved: "Approved",
    settled: "Settled+TDS",
    pct: "Gap %",
  };
  const { sort, toggle, clear } = useUrlTableSort<SortKey>(SORT_KEYS);

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
  };

  // Load action rows for all flagged claims
  const loadActions = async () => {
    setActionsLoading(true);
    const { data, error } = await supabase
      .from("discrepancy_actions")
      .select("claim_id, stage, status, last_action_type, last_action_at, email_sent_count, pushed_to_appeal_at");
    if (!error && data) {
      const map: Record<string, ActionRow> = {};
      for (const r of data) map[r.claim_id] = r as ActionRow;
      setActions(map);
    }
    setActionsLoading(false);
  };

  useEffect(() => {
    void loadActions();
  }, []);

  // Compute every flagged claim with its metrics + action row
  const flagged = useMemo<FlaggedRow[]>(() => {
    const out: FlaggedRow[] = [];
    for (const c of claims) {
      const m = computeDiscrepancy(c, rules);
      if (!m.isDiscrepant) continue;
      out.push({ claim: c, metrics: m, action: actions[c.id] });
    }
    return out;
  }, [claims, rules, actions]);

  // Stage-split + filters
  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = flagged.filter((r) => {
      const inStage = stage === "appeal"
        ? r.action?.stage === "appeal"
        : (r.action?.stage ?? "discrepancy") === "discrepancy";
      if (!inStage) return false;
      if (tpaFilter !== "all" && r.claim.tpa_name !== tpaFilter) return false;
      if (bandFilter !== "all" && r.metrics.band !== (bandFilter as DiscrepancyBand)) return false;
      if (!term) return true;
      return (
        r.claim.claim_number.toLowerCase().includes(term) ||
        r.claim.patient_name.toLowerCase().includes(term) ||
        (r.claim.tpa_name ?? "").toLowerCase().includes(term)
      );
    });
    if (sort.key) {
      return applyNumericSort(base, sort, {
        amount: (r) => r.metrics.amount,
        approved: (r) => r.claim.approved_amount ?? 0,
        settled: (r) => (r.claim.settled_amount ?? 0) + (r.claim.tds_amount ?? 0),
        pct: (r) => r.metrics.pct,
      });
    }
    return base.sort((a, b) => b.metrics.amount - a.metrics.amount);
  }, [flagged, stage, search, tpaFilter, bandFilter, sort]);

  const tpaList = useMemo(() => {
    return Array.from(new Set(flagged.map((r) => r.claim.tpa_name).filter(Boolean))).sort();
  }, [flagged]);

  const counts = useMemo(() => {
    const disc = flagged.filter((r) => (r.action?.stage ?? "discrepancy") === "discrepancy");
    const app = flagged.filter((r) => r.action?.stage === "appeal");
    const totalAmount = visibleRows.reduce((s, r) => s + r.metrics.amount, 0);
    const high = visibleRows.filter((r) => r.metrics.band === "high").length;
    return {
      discrepancyCount: disc.length,
      appealCount: app.length,
      totalAmount,
      high,
      visible: visibleRows.length,
    };
  }, [flagged, visibleRows]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === visibleRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleRows.map((r) => r.claim.id)));
    }
  };

  // Reset selection on stage / filter change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [stage, search, tpaFilter, bandFilter]);

  const openBulk = () => {
    const rows = visibleRows.filter((r) => selectedIds.has(r.claim.id));
    if (rows.length === 0) {
      toast.error("Select at least one claim");
      return;
    }
    setBulkRows(rows.map(({ claim, metrics }) => ({ claim, metrics })));
    setBulkOpen(true);
  };

  const bulkPushToAppeal = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one claim");
      return;
    }
    setPushBusy(true);
    let ok = 0;
    let fail = 0;
    for (const id of selectedIds) {
      const row = visibleRows.find((r) => r.claim.id === id);
      if (!row) continue;
      const existing = actions[id];
      const patch = {
        stage: "appeal",
        status: "in_appeal",
        pushed_to_appeal_at: new Date().toISOString(),
        last_action_type: "push_appeal",
        last_action_at: new Date().toISOString(),
      };
      try {
        if (existing) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await supabase.from("discrepancy_actions").update(patch as any).eq("claim_id", id);
          if (error) throw error;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { getCurrentOrgId: _gco } = await import("@/lib/currentOrg");
          const _orgId = _gco();
          const { error } = await supabase.from("discrepancy_actions").insert({
            org_id: _orgId,
            claim_id: id,
            flagged_amount: row.metrics.amount,
            flagged_pct: row.metrics.pct,
            flag_severity: row.metrics.band ?? "low",
            ...patch,
          } as any);
          if (error) throw error;
          await supabase.from("discrepancy_action_log").insert({
            org_id: _orgId,
            claim_id: id,
            action_type: "push_appeal",
            notes: "Bulk push to Appeal Manager",
          });
        }
        ok += 1;
      } catch (e) {
        console.error("[bulk-push]", id, e);
        fail += 1;
      }
    }
    setPushBusy(false);
    if (fail === 0) toast.success(`Pushed ${ok} to Appeal Manager`);
    else toast.warning(`${ok} pushed, ${fail} failed`);
    setSelectedIds(new Set());
    await loadActions();
  };

  const allChecked = visibleRows.length > 0 && selectedIds.size === visibleRows.length;
  const someChecked = selectedIds.size > 0 && selectedIds.size < visibleRows.length;

  return (
    <AppLayout>
      <TooltipProvider delayDuration={150}>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
                <ShieldAlert className="h-6 w-6 text-warning" />
                Discrepancy Tracker
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
                Short-payment detection & smart follow-up
                {(loading || actionsLoading) && <Loader2 className="h-3 w-3 animate-spin" />}
                {isMock && !loading && (
                  <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (visibleRows.length === 0) {
                    toast.error("Nothing to export — no discrepancies match your filters");
                    return;
                  }
                  const filterBits: string[] = [];
                  if (search) filterBits.push(`search="${search}"`);
                  if (tpaFilter !== "all") filterBits.push(`tpa=${tpaFilter}`);
                  if (bandFilter !== "all") filterBits.push(`severity=${bandFilter}`);
                  exportDiscrepancyXlsx(
                    visibleRows.map((r) => ({
                      claim: r.claim,
                      metrics: r.metrics,
                      lastAction: r.action?.last_action_type,
                      lastActionAt: r.action?.last_action_at,
                      emailsSent: r.action?.email_sent_count,
                      stage: r.action?.stage ?? "discrepancy",
                    })),
                    {
                      hospitalName: visibleRows[0]?.claim.hospital_name ?? undefined,
                      stageLabel: stage === "appeal" ? "Appeal Manager" : "Discrepancy",
                      filterSummary: filterBits.length > 0 ? filterBits.join(" · ") : "None",
                    },
                  );
                  toast.success(`Exported ${visibleRows.length} claim(s) to XLSX`);
                }}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export XLSX
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void refetch(); void loadActions(); }}
              >
                <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
            </div>
          </div>

          {/* KPI strip — unified KpiCard for visual consistency */}
          <KpiGrid cols={4}>
            <KpiCard
              label="Discrepancy queue"
              value={counts.discrepancyCount}
              loading={loading}
              empty={!loading && counts.discrepancyCount === 0}
              icon={<RcmIcons.discrepancy className="h-3.5 w-3.5 text-warning" />}
              caption="Awaiting action"
            />
            <KpiCard
              label="In Appeal"
              value={counts.appealCount}
              loading={loading}
              empty={!loading && counts.appealCount === 0}
              icon={<RcmIcons.appeal className="h-3.5 w-3.5 text-secondary" />}
              caption="Pushed to manager"
            />
            <KpiCard
              label="Visible total"
              value={inrShort(counts.totalAmount)}
              tone="denial"
              loading={loading}
              empty={!loading && counts.totalAmount === 0}
              icon={<RcmIcons.amount className="h-3.5 w-3.5 text-destructive" />}
              caption={`${counts.visible} claim(s)`}
            />
            <KpiCard
              label="High severity"
              value={counts.high}
              tone="denial"
              loading={loading}
              empty={!loading && counts.high === 0}
              icon={<RcmIcons.warning className="h-3.5 w-3.5 text-destructive" />}
              caption={`≥ ${rules.discrepancy_high_pct}% gap`}
            />
          </KpiGrid>

          {/* Stage tabs */}
          <Tabs value={stage} onValueChange={(v) => setStage(v as Stage)}>
            <TabsList>
              <TabsTrigger value="discrepancy">
                Discrepancy
                <Badge variant="outline" className="ml-1.5 text-[10px] py-0">
                  {counts.discrepancyCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="appeal">
                Appeal Manager
                <Badge variant="outline" className="ml-1.5 text-[10px] py-0">
                  {counts.appealCount}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filters + bulk actions */}
          <Card className="p-3 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search claim no, patient, TPA…"
                  className="h-9 pl-8 text-sm"
                />
              </div>
              <Select value={tpaFilter} onValueChange={setTpaFilter}>
                <SelectTrigger className="h-9 w-full lg:w-[200px] text-sm">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <SelectValue placeholder="All TPAs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All TPAs</SelectItem>
                  {tpaList.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={bandFilter} onValueChange={setBandFilter}>
                <SelectTrigger className="h-9 w-full lg:w-[150px] text-sm">
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="low">LOW</SelectItem>
                  <SelectItem value="medium">MED</SelectItem>
                  <SelectItem value="high">HIGH</SelectItem>
                </SelectContent>
              </Select>
              {(search || tpaFilter !== "all" || bandFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSearch(""); setTpaFilter("all"); setBandFilter("all"); }}
                  className="h-9"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <span className="text-xs font-semibold">
                  {selectedIds.size} selected
                </span>
                <span className="text-xs text-muted-foreground">
                  · {inrShort(visibleRows.filter((r) => selectedIds.has(r.claim.id)).reduce((s, r) => s + r.metrics.amount, 0))}
                </span>
                <div className="flex-1" />
                <Button size="sm" variant="outline" onClick={openBulk} className="h-8">
                  <RcmIcons.email className="h-3.5 w-3.5 mr-1.5" />
                  Email + Excel (per TPA)
                </Button>
                {stage === "discrepancy" && (
                  <Button size="sm" onClick={bulkPushToAppeal} disabled={pushBusy} className="h-8">
                    {pushBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <ArrowRightCircle className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Push to Appeal
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="h-8">
                  Clear
                </Button>
              </div>
            )}
          </Card>

          {/* Sort status bar */}
          <SortStatusBar sort={sort} onClear={clear} labels={SORT_LABELS} />

          {/* Table — design-system Table for dark sticky header + sortable cols */}
          <Card variant="flat" className="overflow-hidden">
            <Table className="text-xs" wrapperClassName="max-h-[calc(100vh-360px)]">
              <TableHeader sticky>
                <TableRow>
                  <TableHead className="w-8 h-9 px-2">
                    <Checkbox
                      checked={allChecked}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      ref={(el: any) => { if (el) el.indeterminate = someChecked; }}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all visible"
                    />
                  </TableHead>
                  <TableHead priority="primary" className="h-9 px-2 text-[11px]">Claim No</TableHead>
                  <TableHead priority="primary" className="h-9 px-2 text-[11px]">Patient</TableHead>
                  <TableHead priority="tertiary" className="h-9 px-2 text-[11px]">TPA</TableHead>
                  <SortableTh sortKey="approved" sortState={sort} onSort={toggle} priority="supporting" className="h-9 px-2 text-[11px]">Approved</SortableTh>
                  <SortableTh sortKey="settled" sortState={sort} onSort={toggle} priority="supporting" className="h-9 px-2 text-[11px]">Settled+TDS</SortableTh>
                  <SortableTh sortKey="amount" sortState={sort} onSort={toggle} priority="primary" className="h-9 px-2 text-[11px]">Discrepancy</SortableTh>
                  <TableHead priority="secondary" className="h-9 px-2 text-[11px]">Severity</TableHead>
                  <TableHead priority="tertiary" className="h-9 px-2 text-[11px]">Last Action</TableHead>
                  <TableHead priority="primary" className="h-9 px-2 text-[11px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                      {stage === "appeal"
                        ? "No claims in appeal. Push some from the Discrepancy queue."
                        : "No discrepancies match your filters. Adjust thresholds in Settings → DQ Rules."}
                    </TableCell>
                  </TableRow>
                )}
                {visibleRows.map(({ claim, metrics, action }) => {
                  const checked = selectedIds.has(claim.id);
                  const bandMeta = metrics.band ? BAND_META[metrics.band] : null;
                  return (
                    <TableRow
                      key={claim.id}
                      className={`cursor-pointer ${checked ? "bg-primary/5" : ""}`}
                      onClick={() => { setDrawerClaim(claim); setDrawerMetrics(metrics); }}
                    >
                      <TableCell className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSelect(claim.id)}
                          aria-label={`Select ${claim.claim_number}`}
                        />
                      </TableCell>
                      <TableCell priority="primary" className="px-2 py-1.5 font-mono text-[11px]">{claim.claim_number}</TableCell>
                      <TableCell priority="primary" className="px-2 py-1.5 text-[11px]">{claim.patient_name}</TableCell>
                      <TableCell priority="tertiary" className="px-2 py-1.5 text-[11px] text-muted-foreground truncate max-w-[140px]" title={claim.tpa_name}>{claim.tpa_name}</TableCell>
                      <NumericCell priority="supporting" className="px-2 py-1.5 text-[11px]">{inrShort(claim.approved_amount)}</NumericCell>
                      <NumericCell priority="supporting" className="px-2 py-1.5 text-[11px] text-muted-foreground">{inrShort(claim.settled_amount + claim.tds_amount)}</NumericCell>
                      <NumericCell priority="primary" bold className="px-2 py-1.5 text-[11px] text-destructive">
                        {inrShort(metrics.amount)}
                        <div className="text-[10px] font-normal text-muted-foreground">{metrics.pct.toFixed(1)}%</div>
                      </NumericCell>
                      <TableCell priority="secondary" className="px-2 py-1.5">
                        {bandMeta && (
                          <Badge variant="outline" className={`text-[10px] ${bandMeta.cls}`}>
                            {bandMeta.label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell priority="tertiary" className="px-2 py-1.5 text-[11px]">
                        {action?.last_action_type ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {action.last_action_type.replace("_", " ")}
                                {action.email_sent_count > 0 && ` · ${action.email_sent_count}`}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {action.last_action_at ? new Date(action.last_action_at).toLocaleString() : ""}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
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
          </Card>
        </div>

        {/* Per-claim drawer */}
        <DiscrepancyActionDrawer
          open={!!drawerClaim}
          onOpenChange={(v) => { if (!v) { setDrawerClaim(null); setDrawerMetrics(null); } }}
          claim={drawerClaim}
          metrics={drawerMetrics}
          contacts={contacts}
          hospitalName={drawerClaim?.hospital_name ?? undefined}
          onActionLogged={() => { void loadActions(); void refetch(); }}
        />

        {/* Bulk composer */}
        <DiscrepancyBulkComposer
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          rows={bulkRows}
          contacts={contacts}
          hospitalName={bulkRows[0]?.claim.hospital_name ?? undefined}
          onSent={() => { void loadActions(); void refetch(); setSelectedIds(new Set()); }}
        />

        {/* Single-row email composer */}
        <BulkFollowUpComposer
          open={composerOpen}
          onOpenChange={setComposerOpen}
          target={composerTarget}
          hospitalName={composerTarget?.claims?.[0]?.hospital_name ?? "My Hospital"}
          defaultTone={composerTone}
        />

        {/* Single-row WhatsApp composer */}
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
