import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ListChecks, MessageSquareWarning, FileUp, AlarmClock, AlertTriangle,
  UserCog, Users, Filter, ChevronRight, IndianRupee, RefreshCw, Bug,
  Wifi, WifiOff, SlidersHorizontal, Check, ArrowDown, Mail, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { RcmIcons } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppUsers } from "@/hooks/useAppUsers";
import { useActingUserId } from "@/hooks/useActingUser";
import { useUserAllocations } from "@/hooks/useUserAllocations";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useFollowUpData } from "@/hooks/useFollowUpData";
import { useTaskBuckets, type TaskItem, type TaskCategory } from "@/hooks/useMyTasks";
import { useInsurerContacts, findContactForProvider, type InsurerContactRow } from "@/hooks/useInsurerContacts";
import { useIsMobile } from "@/hooks/use-mobile";
import AllocationManagerDialog from "@/components/AllocationManagerDialog";
import ClaimDrawer from "@/components/ClaimDrawer";
import SwipeableCard from "@/components/SwipeableCard";

interface DiscrepancyRow {
  id: string;
  claim_id: string;
  status: string;
  flagged_amount: number;
  flag_severity: "low" | "medium" | "high";
}

function formatINR(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

const SEVERITY_COLOR: Record<TaskItem["severity"], string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  low: "bg-muted text-muted-foreground border-border",
};

const TAB_META: Record<TaskCategory, { label: string; short: string; Icon: React.ElementType }> = {
  pending_queries:      { label: "Pending Queries",      short: "Queries",   Icon: MessageSquareWarning },
  doc_submission:       { label: "Document Submission",  short: "Documents", Icon: FileUp },
  outstanding_followup: { label: "Outstanding Follow-up", short: "Follow-up", Icon: AlarmClock },
  discrepancy:          { label: "Discrepancy",          short: "Discrepancy", Icon: AlertTriangle },
};

function TaskRowInner({
  t, onOpen, contacts,
}: {
  t: TaskItem;
  onOpen: (id: string) => void;
  contacts: InsurerContactRow[];
}) {
  const provider = t.claim.tpa_name || t.claim.insurance_company_name || "";
  const contact = findContactForProvider(contacts, provider);
  const email = contact?.email?.trim() || "";
  const wa = (contact?.whatsapp || "").replace(/\D/g, "");
  const claimRef = t.claim.claim_number || t.claim.ihx_ref_id || "";
  const subject = `Follow-up: ${claimRef} · ${t.claim.patient_name}`;
  const body = `Hi,%0D%0A%0D%0ARequesting status update on claim ${claimRef} (${t.claim.patient_name}).%0D%0A%0D%0AThanks.`;
  const waText = `Follow-up on claim ${claimRef} for ${t.claim.patient_name}. Kindly share status.`;

  return (
    <div
      className="group flex items-center gap-1.5 sm:gap-2 rounded-lg border bg-card p-2 sm:p-3 transition-colors hover:bg-muted/40 active:bg-muted/60 cursor-pointer"
      onClick={() => onOpen(t.claim.id)}
      role="button"
    >
      <Badge variant="outline" className={`shrink-0 ${SEVERITY_COLOR[t.severity]} text-[9px] sm:text-[10px] uppercase px-1 sm:px-1.5`}>
        {t.severity}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] sm:text-sm font-semibold">{t.title}</div>
        <div className="truncate text-[11px] sm:text-xs text-muted-foreground">{t.subtitle}</div>
        <div className="mt-0.5 flex items-center gap-2 sm:hidden">
          <span className="text-[12px] font-semibold tabular-nums">{formatINR(t.amount)}</span>
          <span className="text-[10px] text-muted-foreground">· {t.dueLabel}</span>
        </div>
      </div>
      <div className="hidden md:block text-right">
        <div className="text-sm font-semibold tabular-nums">{formatINR(t.amount)}</div>
        <div className="text-[11px] text-muted-foreground">{t.dueLabel}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="icon-sm"
          variant="outline"
          disabled={!email}
          aria-label={email ? `Email ${provider || "TPA"} about ${claimRef}` : `Email unavailable — no address on file for ${provider || "TPA"}`}
          title={email ? `Email ${email}` : "No email on file — add one in Settings → Contacts"}
          className="h-7 w-7 bg-secondary/10 text-secondary border-secondary/30 hover:bg-secondary/20 disabled:opacity-40 disabled:bg-muted disabled:text-muted-foreground disabled:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          onClick={(e) => {
            e.stopPropagation();
            if (!email) return;
            window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${body}`;
          }}
        >
          <Mail className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="outline"
          disabled={!wa}
          aria-label={wa ? `WhatsApp ${provider || "TPA"} about ${claimRef}` : `WhatsApp unavailable — no number on file for ${provider || "TPA"}`}
          title={wa ? `WhatsApp ${contact?.whatsapp}` : "No WhatsApp on file — add one in Settings → Contacts"}
          className="h-7 w-7 bg-accent/15 text-accent-foreground border-accent/30 hover:bg-accent/25 disabled:opacity-40 disabled:bg-muted disabled:text-muted-foreground disabled:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          onClick={(e) => {
            e.stopPropagation();
            if (!wa) return;
            window.open(`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`, "_blank");
          }}
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="secondary"
          className="h-7 w-7 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          onClick={(e) => { e.stopPropagation(); onOpen(t.claim.id); }}
          aria-label={`Open claim ${claimRef || t.claim.patient_name}`}
          title="Open claim"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TaskRow({
  t, onOpen, onMarkDone, isMobile, contacts,
}: {
  t: TaskItem;
  onOpen: (id: string) => void;
  onMarkDone: (t: TaskItem) => void;
  isMobile: boolean;
  contacts: InsurerContactRow[];
}) {
  if (!isMobile) return <TaskRowInner t={t} onOpen={onOpen} contacts={contacts} />;
  return (
    <SwipeableCard
      onSwipeRight={() => onOpen(t.claim.id)}
      onSwipeLeft={() => onMarkDone(t)}
      rightLabel="Open claim"
      leftLabel="Mark done"
    >
      <TaskRowInner t={t} onOpen={onOpen} contacts={contacts} />
    </SwipeableCard>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
      No {label.toLowerCase()} right now. 🎉
    </div>
  );
}

export default function MyTasksPage() {
  const { users } = useAppUsers();
  const [actingUserId, setActingUserId] = useActingUserId();
  const { allocations, realtimeConnected, reload: reloadAllocations } = useUserAllocations(actingUserId);
  const { claims, refetch: refetchClaims } = useLiveClaims();
  const { followUps, reload: reloadFollowUps } = useFollowUpData();
  const { contacts } = useInsurerContacts();
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyRow[]>([]);
  const [discRealtimeOk, setDiscRealtimeOk] = useState(false);
  const [activeTab, setActiveTab] = useState<TaskCategory>("pending_queries");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [openClaimId, setOpenClaimId] = useState<string | null>(null);
  const [allocDialogOpen, setAllocDialogOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [pendingDone, setPendingDone] = useState<TaskItem | null>(null);
  const isMobile = useIsMobile();

  // Pull-to-refresh state
  const [pullOffset, setPullOffset] = useState(0);
  const pullRef = useRef<{ startY: number | null; active: boolean }>({ startY: null, active: false });
  const PULL_THRESHOLD = 70;
  const PULL_MAX = 110;

  // Fetch discrepancy actions
  const loadDiscrepancies = useCallback(async () => {
    const { data } = await supabase
      .from("discrepancy_actions")
      .select("id, claim_id, status, flagged_amount, flag_severity")
      .neq("status", "resolved");
    setDiscrepancies((data ?? []) as DiscrepancyRow[]);
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadDiscrepancies();
    const ch = supabase
      .channel(`disc-actions-mytasks-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "discrepancy_actions" },
        () => { if (mounted) void loadDiscrepancies(); },
      )
      .subscribe((status) => {
        if (mounted) setDiscRealtimeOk(status === "SUBSCRIBED");
      });
    return () => {
      mounted = false;
      setDiscRealtimeOk(false);
      supabase.removeChannel(ch);
    };
  }, [loadDiscrepancies]);

  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchClaims(),
        reloadFollowUps(),
        loadDiscrepancies(),
        reloadAllocations(),
      ]);
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [refetchClaims, reloadFollowUps, loadDiscrepancies, reloadAllocations]);

  // Pull-to-refresh handlers (mobile only)
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile) return;
    if (window.scrollY > 0) return;
    pullRef.current = { startY: e.touches[0].clientY, active: true };
  }, [isMobile]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pullRef.current.active || pullRef.current.startY === null) return;
    const dy = e.touches[0].clientY - pullRef.current.startY;
    if (dy <= 0) { setPullOffset(0); return; }
    // Easing
    const eased = Math.min(PULL_MAX, dy * 0.5);
    setPullOffset(eased);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!pullRef.current.active) return;
    const triggered = pullOffset >= PULL_THRESHOLD;
    pullRef.current = { startY: null, active: false };
    setPullOffset(0);
    if (triggered && !refreshing) {
      void handleRefreshAll().then(() => toast.success("Tasks refreshed"));
    }
  }, [pullOffset, refreshing, handleRefreshAll]);

  const currentUser = useMemo(
    () => users.find((u) => u.id === actingUserId) ?? null,
    [users, actingUserId],
  );

  // Build buckets
  const scopeProviders = useMemo(() => allocations.map((a) => a.provider), [allocations]);
  const useAutoFallback = scopeProviders.length === 0 && !!currentUser;

  const buckets = useTaskBuckets({
    claims,
    followUps,
    discrepancies,
    scopeProviders,
    userName: currentUser?.name ?? null,
    useAutoFallback,
    providerFilter,
  });

  // Apply search + dismissed
  const applyFilters = (items: TaskItem[]): TaskItem[] => {
    let out = items.filter((t) => !dismissed.has(t.id));
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (t) =>
          t.subtitle.toLowerCase().includes(q) ||
          t.claim.patient_name?.toLowerCase().includes(q) ||
          t.claim.claim_number?.toLowerCase().includes(q) ||
          t.claim.tpa_name?.toLowerCase().includes(q),
      );
    }
    return out;
  };

  const filtered = {
    pending_queries: applyFilters(buckets.pending_queries),
    doc_submission: applyFilters(buckets.doc_submission),
    outstanding_followup: applyFilters(buckets.outstanding_followup),
    discrepancy: applyFilters(buckets.discrepancy),
  };

  const totals = {
    count:
      filtered.pending_queries.length +
      filtered.doc_submission.length +
      filtered.outstanding_followup.length +
      filtered.discrepancy.length,
    risk:
      filtered.pending_queries.reduce((a, t) => a + t.amount, 0) +
      filtered.doc_submission.reduce((a, t) => a + t.amount, 0) +
      filtered.outstanding_followup.reduce((a, t) => a + t.amount, 0) +
      filtered.discrepancy.reduce((a, t) => a + t.amount, 0),
  };

  const activeFilterCount =
    (providerFilter !== "all" ? 1 : 0) + (search.trim() ? 1 : 0);

  // Visible TPAs in the dropdown — restricted to scope when allocated
  const visibleProviders = useMemo(() => {
    const set = new Set<string>();
    for (const c of claims) {
      if (c.tpa_name) set.add(c.tpa_name);
      if (c.insurance_company_name) set.add(c.insurance_company_name);
    }
    let arr = Array.from(set).filter(Boolean).sort();
    if (scopeProviders.length > 0) {
      const allow = new Set(scopeProviders.map((s) => s.toLowerCase()));
      arr = arr.filter((p) => allow.has(p.toLowerCase()));
    }
    return arr;
  }, [claims, scopeProviders]);

  const confirmMarkDone = () => {
    if (!pendingDone) return;
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(pendingDone.id);
      return next;
    });
    const taskTitle = pendingDone.title;
    setPendingDone(null);
    toast.success("Marked done", {
      description: taskTitle,
      action: {
        label: "Undo",
        onClick: () => setDismissed((prev) => {
          const next = new Set(prev);
          next.delete(pendingDone?.id ?? "");
          return next;
        }),
      },
    });
  };

  const FiltersBody = (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Users className="mr-1 inline h-3 w-3" /> Logged in as
        </label>
        <Select value={actingUserId ?? ""} onValueChange={(v) => setActingUserId(v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select your name…" /></SelectTrigger>
          <SelectContent>
            {users.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No users — add one in Settings → Users.</div>
            ) : users.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name} <span className="text-muted-foreground">· {u.role}</span></SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Filter className="mr-1 inline h-3 w-3" /> TPA / Insurer
        </label>
        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All ({visibleProviders.length || "—"})</SelectItem>
            {visibleProviders.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Search</label>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient, claim, TPA…" className="h-9" />
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div
        className="mx-auto max-w-7xl space-y-3 sm:space-y-5"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* Pull-to-refresh indicator (mobile only) */}
        {isMobile && (pullOffset > 0 || refreshing) && (
          <div
            className="pointer-events-none fixed left-1/2 top-12 z-50 -translate-x-1/2 rounded-full bg-primary/90 text-primary-foreground shadow-lg flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
            style={{
              transform: `translate(-50%, ${Math.min(pullOffset, PULL_MAX) - 30}px)`,
              opacity: Math.min(1, pullOffset / PULL_THRESHOLD),
              transition: pullOffset === 0 ? "transform 200ms ease-out, opacity 200ms" : "none",
            }}
          >
            {refreshing ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Refreshing…</>
            ) : pullOffset >= PULL_THRESHOLD ? (
              <><ArrowDown className="h-3.5 w-3.5 rotate-180" /> Release to refresh</>
            ) : (
              <><ArrowDown className="h-3.5 w-3.5" /> Pull to refresh</>
            )}
          </div>
        )}

        {/* Sticky mobile header */}
        <div className="sticky top-0 z-30 -mx-3 sm:mx-0 sm:static bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:bg-transparent sm:backdrop-blur-0 px-3 sm:px-0 py-2 sm:py-0 border-b sm:border-0 flex flex-wrap items-start sm:items-end justify-between gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-lg sm:text-2xl font-bold tracking-tight">
              <ListChecks className="h-5 w-5 sm:h-6 sm:w-6 text-primary" /> My Tasks
            </h1>
            <p className="hidden sm:block text-sm text-muted-foreground">
              Personalised worklist of pending queries, document submissions, follow-ups and
              discrepancies for the TPAs / insurers allocated to you.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Badge
              variant="outline"
              className={`gap-1 h-8 px-2 ${realtimeConnected && discRealtimeOk
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}
              title={realtimeConnected && discRealtimeOk ? "Realtime connected" : "Realtime offline — use Refresh"}
            >
              {realtimeConnected && discRealtimeOk ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              <span className="hidden sm:inline">{realtimeConnected && discRealtimeOk ? "Live" : "Offline"}</span>
            </Badge>
            <Button variant="outline" size="icon" className="h-8 w-8 sm:hidden" onClick={handleRefreshAll} disabled={refreshing} aria-label="Refresh tasks">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 sm:hidden" onClick={() => setDebugOpen((v) => !v)} aria-label="Debug" aria-pressed={debugOpen}>
              <Bug className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8 sm:hidden" onClick={() => setAllocDialogOpen(true)} aria-label="Allocations">
              <UserCog className="h-4 w-4" />
            </Button>
            {/* Desktop variants with labels */}
            <Button variant="outline" size="sm" className="hidden sm:inline-flex h-8 px-3" onClick={handleRefreshAll} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh Tasks
            </Button>
            <Button variant="outline" size="sm" className="hidden sm:inline-flex h-8 px-3" onClick={() => setDebugOpen((v) => !v)}>
              <Bug className="h-4 w-4 mr-1.5" /> Debug
            </Button>
            <Button variant="outline" size="sm" className="hidden sm:inline-flex h-8 px-3" onClick={() => setAllocDialogOpen(true)}>
              <UserCog className="h-4 w-4 mr-1.5" /> Allocations
            </Button>
          </div>
        </div>

        {debugOpen && (
          <Card className="border-dashed bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bug className="h-4 w-4" /> Debug Panel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-xs">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded border bg-card p-2">
                  <div className="font-semibold text-muted-foreground">Active user</div>
                  <div className="font-mono">{currentUser?.name ?? "—"} <span className="text-muted-foreground">({currentUser?.role ?? "no role"})</span></div>
                  <div className="font-mono text-[10px] text-muted-foreground break-all">{actingUserId ?? "no id"}</div>
                </div>
                <div className="rounded border bg-card p-2">
                  <div className="font-semibold text-muted-foreground">Realtime status</div>
                  <div>user_tpa_allocations: <span className={realtimeConnected ? "text-emerald-600" : "text-destructive"}>{realtimeConnected ? "SUBSCRIBED" : "DISCONNECTED"}</span></div>
                  <div>discrepancy_actions: <span className={discRealtimeOk ? "text-emerald-600" : "text-destructive"}>{discRealtimeOk ? "SUBSCRIBED" : "DISCONNECTED"}</span></div>
                  <div className="text-muted-foreground">Last manual refresh: {lastRefresh ? lastRefresh.toLocaleTimeString() : "never"}</div>
                </div>
              </div>
              <div className="rounded border bg-card p-2">
                <div className="font-semibold text-muted-foreground">Selected TPA mappings ({allocations.length})</div>
                {allocations.length === 0 ? (
                  <div className="text-muted-foreground">No manual allocations — using auto-fallback by name match on tpa_spoc.</div>
                ) : (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {allocations.map((a) => (
                      <Badge key={a.id} variant="secondary" className="font-mono text-[10px]">{a.provider}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded border bg-card p-2">
                <div className="font-semibold text-muted-foreground">Filters</div>
                <div>provider: <span className="font-mono">{providerFilter}</span></div>
                <div>search: <span className="font-mono">{search || "—"}</span></div>
                <div>active tab: <span className="font-mono">{activeTab}</span></div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mobile filter trigger row */}
        <div className="flex items-center gap-2 sm:hidden">
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 flex-1 justify-start">
                <SlidersHorizontal className="h-4 w-4" />
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <Badge variant="default" className="ml-auto h-5 px-1.5 text-[10px]">{activeFilterCount}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-xl max-h-[85vh] overflow-y-auto">
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Filters</SheetTitle>
              </SheetHeader>
              <div className="py-4">{FiltersBody}</div>
              <SheetFooter className="flex-row gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setProviderFilter("all"); setSearch(""); }}
                >
                  Reset
                </Button>
                <SheetClose asChild>
                  <Button className="flex-1">Done</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop user selector + filters */}
        <Card className="hidden sm:block">
          <CardContent className="grid gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3 p-3 sm:p-4">
            <div className="sm:min-w-[220px] sm:flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Users className="mr-1 inline h-3 w-3" /> Logged in as
              </label>
              <Select value={actingUserId ?? ""} onValueChange={(v) => setActingUserId(v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select your name…" /></SelectTrigger>
                <SelectContent>
                  {users.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No users — add one in Settings → Users.</div>
                  ) : users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} <span className="text-muted-foreground">· {u.role}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:min-w-[200px] sm:flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Filter className="mr-1 inline h-3 w-3" /> TPA / Insurer
              </label>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All ({visibleProviders.length || "—"})</SelectItem>
                  {visibleProviders.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:min-w-[200px] sm:flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Search</label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient, claim, TPA…" className="h-9" />
            </div>
          </CardContent>
        </Card>

        {!actingUserId ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Select your name above to load your task list.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary strip — unified KpiCard */}
            <KpiGrid cols={3} className="keep-cols">
              <KpiCard
                label="Open tasks"
                value={totals.count.toLocaleString("en-IN")}
                empty={totals.count === 0}
                icon={<RcmIcons.worklist className="h-3.5 w-3.5 text-primary" />}
              />
              <KpiCard
                label="At risk"
                value={formatINR(totals.risk)}
                tone="denial"
                empty={totals.risk === 0}
                icon={<IndianRupee className="h-3.5 w-3.5 text-destructive" />}
              />
              <KpiCard
                label="TPAs in scope"
                value={scopeProviders.length || "Auto"}
                icon={<RcmIcons.team className="h-3.5 w-3.5 text-success" />}
                caption={scopeProviders.length === 0 ? "Falling back to tpa_spoc match" : undefined}
              />
            </KpiGrid>

            {isMobile && (
              <p className="text-[10px] text-muted-foreground sm:hidden -mt-1 px-1">
                Tip: swipe a task right to open · swipe left to mark done · pull down to refresh
              </p>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TaskCategory)}>
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4">
                {(Object.keys(TAB_META) as TaskCategory[]).map((k) => {
                  const { label, short, Icon } = TAB_META[k];
                  const count = filtered[k].length;
                  return (
                    <TabsTrigger key={k} value={k} className="flex flex-col gap-1 py-2 sm:flex-row sm:gap-2">
                      <span className="flex items-center gap-1.5">
                        <Icon className="h-4 w-4" />
                        <span className="hidden sm:inline">{label}</span>
                        <span className="sm:hidden">{short}</span>
                      </span>
                      <Badge variant={count > 0 ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">
                        {count}
                      </Badge>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {(Object.keys(TAB_META) as TaskCategory[]).map((k) => (
                <TabsContent key={k} value={k} className="mt-4 space-y-2">
                  {filtered[k].length === 0 ? (
                    <EmptyState label={TAB_META[k].label} />
                  ) : (
                    filtered[k].map((t) => (
                      <TaskRow
                        key={t.id}
                        t={t}
                        onOpen={setOpenClaimId}
                        onMarkDone={setPendingDone}
                        isMobile={isMobile}
                        contacts={contacts}
                      />
                    ))
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </div>

      <AllocationManagerDialog
        open={allocDialogOpen}
        onOpenChange={setAllocDialogOpen}
        initialUserId={actingUserId}
      />
      {openClaimId && (() => {
        const c = claims.find((x) => x.id === openClaimId);
        return c ? <ClaimDrawer claim={c} onClose={() => setOpenClaimId(null)} /> : null;
      })()}

      <AlertDialog open={!!pendingDone} onOpenChange={(o) => { if (!o) setPendingDone(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-success" /> Mark task as done?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDone?.title}
              <br />
              <span className="text-xs text-muted-foreground">
                This removes it from your list for this session. Tap Undo in the toast to restore.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMarkDone}>Mark done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
