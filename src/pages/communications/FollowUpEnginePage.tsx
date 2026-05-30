// Follow-up Engine — heart of the platform.
// Server-paginated worklist of TPAs/Insurers with pending claims, KPI cards,
// bulk select, and one-click bulk follow-up email composer.

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  Mail,
  MessageCircle,
  AlertTriangle,
  Search,
  Download,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Metric } from "@/components/ui/metric";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTh, useUrlTableSort, SortStatusBar } from "@/components/ui/numeric-cell";
import { ClaimsPagination } from "@/components/ui/claims-pagination";
import { useFollowupGroupsPage, type FollowupPriority } from "@/hooks/useFollowupGroupsPage";
import { useInsurerContacts, findContactForProvider, fetchContactsForProviders } from "@/hooks/useInsurerContacts";
import { rowToClaim } from "@/hooks/useLiveClaims";
import { supabase } from "@/integrations/supabase/client";
import { formatInrCompact, type Claim } from "@/data/mockClaims";
import BulkFollowUpComposer, { type ComposerTarget, type FollowUpTone } from "@/components/BulkFollowUpComposer";
import BulkSendProgressDialog, { type BulkSendTarget } from "@/components/BulkSendProgressDialog";
import WhatsAppComposerDialog from "@/components/WhatsAppComposerDialog";
import RowActionButtons from "@/components/RowActionButtons";
import { RcmIcons } from "@/lib/icons";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KpiCardSkeleton, TableRowsSkeleton } from "@/components/skeletons";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useSearchParams } from "@/lib/router-compat";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 25;
type SortKey = "outstanding" | "oldest" | "claims";
type Priority = "all" | FollowupPriority;

interface TpaRow {
  tpa: string;
  claimCount: number;
  total: number;
  oldest: number;
  breaches: number;
  priority: FollowupPriority;
  recipientEmail: string;
  ccEmails: string;
  whatsapp: string | null;
}

const priorityCls: Record<FollowupPriority, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-warning/15 text-warning-foreground border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

function csvEscape(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Fetch open claims for the given TPA keys (matches view's COALESCE key).
 * Scoped server-side: tpa_name IN (keys) OR (tpa_name IS NULL/'' AND insurance_company_name IN (keys)). */
async function fetchClaimsForTpas(tpaKeys: string[]): Promise<Map<string, Claim[]>> {
  const out = new Map<string, Claim[]>();
  if (tpaKeys.length === 0) return out;
  // Run two scoped queries and merge — avoids encoding pitfalls in PostgREST `.or()` lists.
  // Denied / rejected / repudiated claims (incl. Pre-Auth Denied, Enhancement
  // Denied, Claim Denied) live only on the Denials page — never in follow-up.
  const excludeDenied = <T extends { not: (col: string, op: string, val: string) => T }>(q: T): T =>
    q.not("claim_status", "ilike", "%deni%")
     .not("claim_status", "ilike", "%reject%")
     .not("claim_status", "ilike", "%repudiat%");
  const [a, b] = await Promise.all([
    excludeDenied(supabase.from("claims").select("*").gt("outstanding_amount", 0).in("tpa_name", tpaKeys)),
    excludeDenied(
      supabase.from("claims").select("*").gt("outstanding_amount", 0)
        .or("tpa_name.is.null,tpa_name.eq.")
        .in("insurance_company_name", tpaKeys),
    ),
  ]);
  if (a.error) { toast.error(`Failed to load claim details: ${a.error.message}`); return out; }
  if (b.error) { toast.error(`Failed to load claim details: ${b.error.message}`); return out; }
  const seen = new Set<string>();
  const wanted = new Set(tpaKeys);
  for (const r of ([...(a.data ?? []), ...(b.data ?? [])]) as Record<string, unknown>[]) {
    const id = String(r.id ?? "");
    if (seen.has(id)) continue;
    seen.add(id);
    const tpa = (r.tpa_name as string) || (r.insurance_company_name as string) || "Unknown";
    if (!wanted.has(tpa)) continue;
    const c = rowToClaim(r);
    const arr = out.get(tpa) ?? [];
    arr.push(c);
    out.set(tpa, arr);
  }
  return out;
}

export default function FollowUpEnginePage() {
  const { contacts } = useInsurerContacts();
  const [params, setParams] = useSearchParams();

  const search = params.get("q") ?? "";
  const priorityFilter = (params.get("priority") as Priority) || "all";
  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = (() => {
    const n = parseInt(params.get("size") ?? "", 10);
    return [10, 25, 50, 100].includes(n) ? n : DEFAULT_PAGE_SIZE;
  })();

  const SORT_KEYS = ["outstanding", "oldest", "claims"] as const;
  const SORT_LABELS: Record<SortKey, string> = {
    outstanding: "Outstanding",
    oldest: "Oldest",
    claims: "Claims",
  };
  const { sort, toggle, clear } = useUrlTableSort<SortKey>(SORT_KEYS);

  const { rows, totalCount, totalPages, kpis, loading, kpisLoading } = useFollowupGroupsPage({
    priority: priorityFilter,
    search,
    sort: (sort.key ?? "outstanding") as SortKey,
    dir: sort.dir === "asc" ? "asc" : "desc",
    page: page - 1,
    pageSize,
  });

  // Selection lives in URL — keyed by TPA name (works across pages)
  const selected = useMemo<Set<string>>(() => {
    const raw = params.get("sel");
    if (!raw) return new Set();
    return new Set(raw.split(",").map((s) => decodeURIComponent(s)).filter(Boolean));
  }, [params]);

  const patchParams = useCallback(
    (updates: Record<string, string | null>) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(updates)) {
          if (v === null || v === "") next.delete(k);
          else next.set(k, v);
        }
        return next;
      }, { replace: true });
    },
    [setParams],
  );

  const setSearch = (v: string) => patchParams({ q: v || null, page: null });
  const setPriorityFilter = (v: Priority) =>
    patchParams({ priority: v === "all" ? null : v, page: null });
  const writeSelected = (next: Set<string>) =>
    patchParams({
      sel: next.size === 0 ? null : Array.from(next).map(encodeURIComponent).join(","),
    });
  const setPage = (zeroIdx: number) =>
    patchParams({ page: zeroIdx <= 0 ? null : String(zeroIdx + 1) });
  const setPageSize = (n: number) =>
    patchParams({ size: n === DEFAULT_PAGE_SIZE ? null : String(n), page: null });

  // Decorate hook rows with contact info
  const pageRows = useMemo<TpaRow[]>(() => rows.map((r) => {
    const contact = findContactForProvider(contacts, r.tpa);
    return {
      tpa: r.tpa,
      claimCount: r.claim_count,
      total: r.total_outstanding,
      oldest: r.oldest_days,
      breaches: r.breach_count,
      priority: r.priority,
      recipientEmail: contact?.email ?? "",
      ccEmails: contact?.cc_emails ?? "",
      whatsapp: contact?.whatsapp ?? null,
    };
  }), [rows, contacts]);

  // Composer / dialog state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTarget, setComposerTarget] = useState<ComposerTarget | null>(null);
  const [composerTone, setComposerTone] = useState<FollowUpTone>("formal");
  const [waRole, setWaRole] = useState<string>("billing");
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressTargets] = useState<BulkSendTarget[]>([]);
  const [waOpen, setWaOpen] = useState(false);
  const [waTarget, setWaTarget] = useState<{
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

  // Clamp page if it overruns total pages after a filter change.
  useEffect(() => {
    if (!loading && page > totalPages) setPage(Math.max(0, totalPages - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalPages]);

  const toggleAll = () => {
    const allOnPage = pageRows.map((r) => r.tpa);
    const everySelected = allOnPage.length > 0 && allOnPage.every((t) => selected.has(t));
    const next = new Set(selected);
    if (everySelected) allOnPage.forEach((t) => next.delete(t));
    else allOnPage.forEach((t) => next.add(t));
    writeSelected(next);
  };

  const toggleOne = (tpa: string) => {
    const next = new Set(selected);
    next.has(tpa) ? next.delete(tpa) : next.add(tpa);
    writeSelected(next);
  };

  const openComposerFor = async (g: TpaRow, tone: FollowUpTone = "formal") => {
    const claimsMap = await fetchClaimsForTpas([g.tpa]);
    const cs = claimsMap.get(g.tpa) ?? [];
    setComposerTone(tone);
    setComposerTarget({
      insurerName: g.tpa,
      recipientEmail: g.recipientEmail,
      ccEmails: g.ccEmails,
      whatsapp: g.whatsapp,
      claims: cs,
    });
    setComposerOpen(true);
    if (!g.recipientEmail) {
      toast(`Opened composer for ${g.tpa}. Add or edit the recipient email before sending.`);
    }
  };

  const openCallFor = (g: TpaRow) => {
    const contact = findContactForProvider(contacts, g.tpa);
    const num = contact?.phone || g.whatsapp;
    if (!num) {
      toast.error(`No phone number on file for ${g.tpa}`, {
        description: "Add a phone number in Settings → Contacts.",
      });
      return;
    }
    window.location.href = `tel:${num.replace(/\s+/g, "")}`;
  };

  const openBulkComposer = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one TPA");
      return;
    }
    const tpas = Array.from(selected);
    const [claimsMap, contactMap] = await Promise.all([
      fetchClaimsForTpas(tpas),
      fetchContactsForProviders(tpas),
    ]);

    // Warn about TPAs with no contact record at all (not just empty email field)
    const noContactAtAll = tpas.filter((t) => !contactMap.has(t));
    if (noContactAtAll.length > 0) {
      toast.warning(
        `${noContactAtAll.length} selected TPA(s) have no contact on file`,
        {
          description: noContactAtAll.slice(0, 5).join(", ") + (noContactAtAll.length > 5 ? "…" : ""),
          duration: 8000,
        },
      );
    }

    const sel = tpas
      .map((t) => {
        const c = contactMap.get(t);
        return {
          tpa: t,
          recipientEmail: c?.email ?? "",
          ccEmails: c?.cc_emails ?? "",
          whatsapp: c?.whatsapp ?? null,
          claims: claimsMap.get(t) ?? [],
        };
      })
      .filter((g) => g.claims.length > 0);

    if (sel.length === 0) {
      toast.error("No open claims for the selected TPAs");
      return;
    }

    if (sel.length === 1) {
      const g = sel[0];
      setComposerTarget({
        insurerName: g.tpa,
        recipientEmail: g.recipientEmail,
        ccEmails: g.ccEmails,
        whatsapp: g.whatsapp,
        claims: g.claims,
      });
      setComposerOpen(true);
      return;
    }
    setComposerTarget({
      insurerName: `${sel.length} selected TPAs / Insurers`,
      recipientEmail: "",
      ccEmails: "",
      whatsapp: null,
      claims: sel.flatMap((g) => g.claims),
      tpaGroups: sel,
    });
    setComposerOpen(true);

    const missing = sel.filter((g) => !g.recipientEmail).length;
    if (missing > 0) {
      toast(`${missing} selected TPA(s) are missing email IDs. Edit them inline in the composer or skip them.`);
    }
  };

  const openWhatsAppFor = async (g: TpaRow, role: string = "billing") => {
    const claimsMap = await fetchClaimsForTpas([g.tpa]);
    const cs = claimsMap.get(g.tpa) ?? [];
    const lead = cs[0];
    if (!lead) {
      toast.error(`No open claims for ${g.tpa}`);
      return;
    }
    setWaRole(role);
    setWaTarget({
      claimId: lead.id,
      recipient: g.whatsapp ?? null,
      recipientLabel: `${g.tpa} · WhatsApp`,
      context: {
        patient_name: lead.patient_name ?? null,
        claim_number: lead.claim_number ?? `${cs.length} claims`,
        hospital_name: lead.hospital_name ?? null,
        outstanding_amount: g.total,
        days_since_claim: g.oldest,
        tpa_name: lead.tpa_name || g.tpa,
        tpa_spoc_name: null,
        insurance_company_name: lead.insurance_company_name ?? g.tpa,
        last_communication_note: lead.last_communication_note ?? null,
      },
    });
    setWaOpen(true);
    if (!g.whatsapp) {
      toast(`Opened WhatsApp composer for ${g.tpa}. Add a number or share the message manually.`);
    }
  };

  const sendBulkWhatsApp = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one TPA");
      return;
    }
    const tpas = Array.from(selected);
    if (tpas.length === 1) {
      const row = pageRows.find((r) => r.tpa === tpas[0]);
      if (row) await openWhatsAppFor(row);
      return;
    }
    const [claimsMap, contactMap] = await Promise.all([
      fetchClaimsForTpas(tpas),
      fetchContactsForProviders(tpas),
    ]);

    // Warn about TPAs with no contact record at all (not just empty WhatsApp field)
    const noContactAtAll = tpas.filter((t) => !contactMap.has(t));
    if (noContactAtAll.length > 0) {
      toast.warning(
        `${noContactAtAll.length} selected TPA(s) have no contact on file`,
        {
          description: noContactAtAll.slice(0, 5).join(", ") + (noContactAtAll.length > 5 ? "…" : ""),
          duration: 8000,
        },
      );
    }

    const sel = tpas.map((t) => {
      const c = contactMap.get(t);
      return {
        tpa: t,
        recipientEmail: c?.email ?? "",
        ccEmails: c?.cc_emails ?? "",
        whatsapp: c?.whatsapp ?? null,
        claims: claimsMap.get(t) ?? [],
      };
    }).filter((g) => g.claims.length > 0);

    if (sel.length === 0) {
      toast.error("No open claims for the selected TPAs");
      return;
    }

    setComposerTarget({
      insurerName: `${sel.length} selected TPAs / Insurers`,
      recipientEmail: "",
      ccEmails: "",
      whatsapp: null,
      claims: sel.flatMap((g) => g.claims),
      tpaGroups: sel,
    });
    setComposerOpen(true);
    toast("Edit WhatsApp numbers per TPA inline, then hit Send WhatsApp.");
  };

  const exportCsv = useCallback(async () => {
    // Pull the full filtered set from the view (cap 10k rows for safety).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabase as any).from("v_followup_tpa_groups").select("*");
    if (priorityFilter !== "all") q = q.eq("priority", priorityFilter);
    if (search.trim()) q = q.ilike("tpa", `%${search.trim().replace(/[\\%_]/g, (m: string) => `\\${m}`)}%`);
    q = q.order(
      sort.key === "claims" ? "claim_count" : sort.key === "oldest" ? "oldest_days" : "total_outstanding",
      { ascending: sort.dir === "asc" },
    ).limit(10000);
    const { data, error } = await q;
    if (error) { toast.error(`Export failed: ${error.message}`); return; }
    const all = (data ?? []) as Array<Record<string, unknown>>;
    if (all.length === 0) {
      toast.error("Nothing to export for current filters");
      return;
    }
    const header = [
      "Priority", "TPA", "Claims", "Outstanding (INR)", "Oldest (days)",
      "SLA Breaches", "Recipient Email", "CC Emails", "WhatsApp",
    ];
    const rowsCsv = all.map((r) => {
      const tpa = String(r.tpa ?? "");
      const contact = findContactForProvider(contacts, tpa);
      return [
        String(r.priority ?? ""),
        tpa,
        Number(r.claim_count ?? 0),
        Number(r.total_outstanding ?? 0),
        Number(r.oldest_days ?? 0),
        Number(r.breach_count ?? 0),
        contact?.email ?? "",
        contact?.cc_emails ?? "",
        contact?.whatsapp ?? "",
      ];
    });
    const csv = [header, ...rowsCsv].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `follow-up-worklist-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${all.length} row(s)`);
  }, [priorityFilter, search, sort, contacts]);

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.tpa));

  // Pre-flight: how many selected TPAs have no contact record at all (using in-memory contacts)
  const selectedNoContactCount = useMemo(() => {
    if (selected.size === 0) return 0;
    return Array.from(selected).filter((t) => !findContactForProvider(contacts, t)).length;
  }, [selected, contacts]);

  return (
    <AppLayout>
      <TooltipProvider delayDuration={200}>
      <div className="px-4 md:px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Follow-up Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auto-generated follow-up list based on SLA breach, no-response, and pending claims. One-click communication.
          </p>
        </div>

        {/* KPI cards */}
        {kpisLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton /><KpiCardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <Metric label="Overdue Follow-ups" value={kpis.overdue} tone="denial"
                icon={<RcmIcons.warning className="h-3.5 w-3.5 text-destructive" />} caption="past due date" />
            </Card>
            <Card className="p-4">
              <Metric label="Due Today" value={kpis.dueToday}
                icon={<RcmIcons.aging className="h-3.5 w-3.5 text-warning" />} caption="action needed today" />
            </Card>
            <Card className="p-4">
              <Metric label="Upcoming (7 days)" value={kpis.upcoming}
                icon={<RcmIcons.followUp className="h-3.5 w-3.5 text-secondary" />} caption="schedule ahead" />
            </Card>
            <Card className="p-4">
              <Metric label="Comm. Sent Today" value={0} tone="success"
                icon={<RcmIcons.paid className="h-3.5 w-3.5 text-success" />} caption="via email / WhatsApp" />
            </Card>
          </div>
        )}
        <SortStatusBar sort={sort} onClear={clear} labels={SORT_LABELS} />

        {/* Toolbar */}
        <Card className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search TPA / patient…"
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as Priority)}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={toggleAll} className="h-9">
            Select Page
          </Button>
          {selectedNoContactCount > 0 && (
            <Badge
              variant="outline"
              className="h-9 px-2.5 gap-1.5 bg-warning/10 text-warning border-warning/40 cursor-default"
              title={`${selectedNoContactCount} selected TPA(s) have no contact on file. Add them in Settings → Contacts.`}
            >
              <AlertTriangle className="h-3 w-3" />
              {selectedNoContactCount} missing contact{selectedNoContactCount > 1 ? "s" : ""}
            </Badge>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={loading || totalCount === 0}
              className="h-9"
              title="Export the current filtered & sorted rows as CSV"
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button
              size="sm"
              onClick={openBulkComposer}
              disabled={selected.size === 0}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-9"
            >
              <Mail className="h-4 w-4" /> Bulk Email
              {selected.size > 0 && ` (${selected.size})`}
            </Button>
            <Button
              size="sm"
              onClick={sendBulkWhatsApp}
              disabled={selected.size === 0}
              className="bg-accent text-accent-foreground hover:bg-accent/90 h-9"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </Button>
          </div>
        </Card>

        {/* Worklist table */}
        <Card className="shadow-sm overflow-hidden">
          <Table className="text-xs" dense>
            <TableHeader>
              <TableRow>
                <TableHead priority="primary" className="w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={toggleAll}
                    className="border-sidebar-foreground/40 data-[state=checked]:bg-sidebar-foreground data-[state=checked]:text-sidebar"
                  />
                </TableHead>
                <TableHead priority="primary">Priority</TableHead>
                <TableHead priority="primary">TPA</TableHead>
                <SortableTh sortKey="claims" sortState={sort} onSort={toggle} priority="secondary">Claims</SortableTh>
                <SortableTh sortKey="outstanding" sortState={sort} onSort={toggle} priority="primary" align="right">Outstanding</SortableTh>
                <SortableTh sortKey="oldest" sortState={sort} onSort={toggle} priority="secondary" align="right">Oldest</SortableTh>
                <TableHead priority="primary" align="right">Actions</TableHead>
                <TableHead priority="tertiary" align="center">SLA Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRowsSkeleton rows={pageSize > 10 ? 8 : pageSize} cols={8} />}
              {!loading && pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                    🎉 No pending follow-ups for the current filter.
                  </TableCell>
                </TableRow>
              )}
              {!loading && pageRows.map((g) => {
                const p = g.priority;
                const onTrack = g.breaches === 0 && g.oldest <= 15;
                return (
                  <TableRow key={g.tpa} className={cn(selected.has(g.tpa) && "bg-muted/40")}>
                    <TableCell priority="primary">
                      <Checkbox
                        checked={selected.has(g.tpa)}
                        onCheckedChange={() => toggleOne(g.tpa)}
                      />
                    </TableCell>
                    <TableCell priority="primary">
                      <Badge variant="outline" className={cn("capitalize", priorityCls[p])}>
                        {p}
                      </Badge>
                    </TableCell>
                    <TableCell priority="primary" className="font-medium max-w-xs">
                      <div className="truncate">{g.tpa}</div>
                      {(!g.recipientEmail || !g.whatsapp) && (
                        <Link
                          to="/providers/contacts"
                          className="text-[10px] text-warning hover:underline mt-0.5 inline-flex items-center gap-1"
                          onClick={(e: MouseEvent) => e.stopPropagation()}
                          title="Open Settings → Contacts to add or edit this TPA"
                        >
                          ⚠ {!g.recipientEmail && "no email"}
                          {!g.recipientEmail && !g.whatsapp && " · "}
                          {!g.whatsapp && "no WhatsApp"} — Add in Settings → Contacts
                        </Link>
                      )}
                    </TableCell>
                    <TableCell priority="secondary">{g.claimCount} claim(s)</TableCell>
                    <TableCell priority="primary" numeric className="font-mono font-semibold">
                      {formatInrCompact(g.total)}
                    </TableCell>
                    <TableCell priority="secondary" align="right">
                      <Badge
                        variant="outline"
                        className={cn(
                          g.oldest > 30
                            ? "bg-destructive/10 text-destructive border-destructive/30"
                            : g.oldest > 15
                              ? "bg-warning/15 text-warning-foreground border-warning/30"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {g.oldest} days
                      </Badge>
                    </TableCell>
                    <TableCell priority="primary" align="right" className="p-1 sm:p-2">
                      <RowActionButtons
                        onEmail={(tone) => void openComposerFor(g, tone)}
                        onWhatsApp={(role) => void openWhatsAppFor(g, role)}
                        onCall={() => openCallFor(g)}
                      />
                    </TableCell>
                    <TableCell priority="tertiary" align="center">
                      {g.breaches > 0 ? (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1">
                          <AlertTriangle className="h-3 w-3" /> {g.breaches} breach
                        </Badge>
                      ) : onTrack ? (
                        <Badge variant="outline" className="bg-accent/15 text-accent-foreground border-accent/30">
                          On Track
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-warning/15 text-warning-foreground border-warning/30">
                          Watch
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!loading && (
            <div className="border-t">
              <ClaimsPagination
                page={page - 1}
                pageSize={pageSize}
                totalCount={totalCount}
                totalPages={totalPages}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          )}
        </Card>

        <p className="text-xs text-muted-foreground">
          💡 Tip: TPA / Insurer email IDs are pulled from <strong>Settings → Contacts</strong>. Update there to change recipients.
        </p>
      </div>

      <BulkFollowUpComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        target={composerTarget}
        hospitalName="My Hospital"
        defaultTone={composerTone}
      />

      <BulkSendProgressDialog
        open={progressOpen}
        onOpenChange={setProgressOpen}
        targets={progressTargets}
        hospitalName="My Hospital"
        onComplete={() => { writeSelected(new Set()); }}
      />

      <WhatsAppComposerDialog
        open={waOpen}
        onOpenChange={setWaOpen}
        claimId={waTarget?.claimId ?? ""}
        recipient={waTarget?.recipient ?? null}
        recipientLabel={waTarget?.recipientLabel}
        defaultRole={waRole}
        context={waTarget?.context ?? {
          patient_name: null,
          claim_number: null,
          hospital_name: null,
          outstanding_amount: null,
          days_since_claim: null,
          tpa_name: null,
          tpa_spoc_name: null,
          insurance_company_name: null,
          last_communication_note: null,
        }}
      />
      </TooltipProvider>
    </AppLayout>
  );
}
