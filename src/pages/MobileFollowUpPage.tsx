import { useEffect, useMemo, useRef, useState } from "react";
import { Phone, MessageSquare, Calendar as CalendarIcon, ChevronRight, Search, AlertTriangle, CheckCircle2, X, ArrowLeft, Loader2, SlidersHorizontal, ShieldAlert } from "lucide-react";
import { buildWhatsAppUrl, tpaFollowUpMessage } from "@/lib/whatsapp";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import SwipeableCard from "@/components/SwipeableCard";
import { useFollowUpData, type ClaimWithMeta, type NewFollowUpInput } from "@/hooks/useFollowUpData";
import { formatInr, formatDays } from "@/data/mockClaims";

type Tab = "critical" | "today" | "all" | "done";
type Outcome = "reached" | "voicemail" | "promised" | "denied-info" | "callback";
type Role = "cfo" | "billing" | "ops" | "admin";
type SheetMode = "full" | "date-only";

interface OutcomeMeta { id: Outcome; label: string; tone: string; icon: string }

const OUTCOMES: OutcomeMeta[] = [
  { id: "reached",      label: "Reached SPOC",       tone: "bg-success/15 text-success border-success/30",         icon: "✅" },
  { id: "promised",     label: "Promised Payment",   tone: "bg-primary/15 text-primary border-primary/30",         icon: "💰" },
  { id: "voicemail",    label: "No Answer / VM",     tone: "bg-muted text-muted-foreground border-border",         icon: "📵" },
  { id: "denied-info",  label: "Asked for Docs",     tone: "bg-warning/15 text-warning border-warning/30",         icon: "📄" },
  { id: "callback",     label: "Asked Callback",     tone: "bg-secondary/15 text-secondary-foreground border-border", icon: "🔁" },
];

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function ageBadge(days: number, breach: boolean) {
  if (breach) return "bg-destructive text-destructive-foreground";
  if (days >= 30) return "bg-warning text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

const ROLE_STORAGE_KEY = "rcm-buddy-role";
const FILTERS_STORAGE_KEY = "rcm-buddy-mobile-followup-filters";
const VALID_TABS: Tab[] = ["critical", "today", "all", "done"];

interface PersistedFilters {
  tab: Tab;
  search: string;
  statusFilters: string[];
  insurerFilters: string[];
  breachOnly: boolean;
}

function readInitialFilters(searchParams: URLSearchParams): PersistedFilters {
  // URL takes precedence, then localStorage, then defaults.
  let stored: Partial<PersistedFilters> = {};
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as Partial<PersistedFilters>;
  } catch {
    // ignore corrupt storage
  }

  const urlTab = searchParams.get("tab") as Tab | null;
  const urlSearch = searchParams.get("q");
  const urlStatus = searchParams.get("status");
  const urlInsurer = searchParams.get("insurer");
  const urlBreach = searchParams.get("breach");

  const tab: Tab =
    urlTab && VALID_TABS.includes(urlTab) ? urlTab :
    stored.tab && VALID_TABS.includes(stored.tab) ? stored.tab :
    "critical";

  const splitCsv = (v: string | null) =>
    v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null;

  return {
    tab,
    search: urlSearch ?? stored.search ?? "",
    statusFilters: splitCsv(urlStatus) ?? stored.statusFilters ?? [],
    insurerFilters: splitCsv(urlInsurer) ?? stored.insurerFilters ?? [],
    breachOnly: urlBreach != null ? urlBreach === "1" : stored.breachOnly ?? false,
  };
}

// Role-based claim filter — matches the spirit of the sidebar role views
function filterByRole(claims: ClaimWithMeta[], role: Role): ClaimWithMeta[] {
  const open = claims.filter((c) => !c.claim_status.toLowerCase().includes("settled"));
  switch (role) {
    case "cfo":
      // CFO cares about big-ticket + SLA breaches
      return open.filter((c) => c.is_irdai_breach || c.outstanding_amount >= 50000);
    case "billing":
      // Billing chases everything open
      return open;
    case "ops":
      // Ops focuses on pre-auth & query stages
      return open.filter((c) => /query|pre auth|denied|approved/i.test(c.claim_status));
    case "admin":
    default:
      return open;
  }
}

export default function MobileFollowUpPage() {
  const navigate = useNavigate();
  const { claims, loading, logFollowUp, deleteFollowUp } = useFollowUpData();

  const [role, setRole] = useState<Role>("billing");
  useEffect(() => {
    const read = () => setRole(((localStorage.getItem(ROLE_STORAGE_KEY) as Role) || "billing"));
    read();
    window.addEventListener("storage", read);
    window.addEventListener("rcm-role-change", read as EventListener);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("rcm-role-change", read as EventListener);
    };
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  // Lazy init from URL → localStorage → defaults (runs once)
  const initial = useRef<PersistedFilters | null>(null);
  if (initial.current === null) initial.current = readInitialFilters(searchParams);

  const [tab, setTab] = useState<Tab>(initial.current.tab);
  const [search, setSearch] = useState(initial.current.search);
  const [activeClaim, setActiveClaim] = useState<ClaimWithMeta | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>("full");

  // Advanced filters
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<string[]>(initial.current.statusFilters);
  const [insurerFilters, setInsurerFilters] = useState<string[]>(initial.current.insurerFilters);
  const [breachOnly, setBreachOnly] = useState(initial.current.breachOnly);

  // Persist to URL + localStorage whenever any filter changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const setOrDelete = (key: string, value: string | null) => {
      if (value && value.length) params.set(key, value);
      else params.delete(key);
    };
    setOrDelete("tab", tab !== "critical" ? tab : null);
    setOrDelete("q", search);
    setOrDelete("status", statusFilters.join(","));
    setOrDelete("insurer", insurerFilters.join(","));
    setOrDelete("breach", breachOnly ? "1" : null);
    setSearchParams(params, { replace: true });

    try {
      const payload: PersistedFilters = { tab, search, statusFilters, insurerFilters, breachOnly };
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // storage may be full / disabled — non-fatal
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, statusFilters, insurerFilters, breachOnly]);

  // Drawer step state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [refNumber, setRefNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [nextDateOption, setNextDateOption] = useState<string>("3");
  const [saving, setSaving] = useState(false);

  const roleFiltered = useMemo(() => filterByRole(claims, role), [claims, role]);

  // Apply tab + search to derive the "visible universe" before facet filters.
  // The bottom-sheet facet options come from this base, so the choices and
  // result list always reflect the same scope.
  const tabSearchScoped = useMemo(() => {
    let list = roleFiltered;
    if (tab === "critical") list = list.filter((c) => c.is_irdai_breach || c.days_since_claim >= 30);
    else if (tab === "today") list = list.filter((c) => !c.latest_follow_up);
    else if (tab === "done") list = list.filter((c) => !!c.latest_follow_up);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.patient_name.toLowerCase().includes(q) ||
          c.claim_number.toLowerCase().includes(q) ||
          c.tpa_name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [roleFiltered, tab, search]);

  // Faceted options: each facet's choices exclude its own filter so users can
  // still toggle within it, but reflect the other active filters + tab + search.
  const statusOptions = useMemo(() => {
    const base = tabSearchScoped.filter((c) => {
      if (insurerFilters.length && !insurerFilters.includes(c.tpa_name)) return false;
      if (breachOnly && !c.is_irdai_breach) return false;
      return true;
    });
    // Always include currently-selected statuses so users can de-select them.
    return Array.from(new Set([...base.map((c) => c.claim_status), ...statusFilters])).sort();
  }, [tabSearchScoped, insurerFilters, breachOnly, statusFilters]);

  const insurerOptions = useMemo(() => {
    const base = tabSearchScoped.filter((c) => {
      if (statusFilters.length && !statusFilters.includes(c.claim_status)) return false;
      if (breachOnly && !c.is_irdai_breach) return false;
      return true;
    });
    return Array.from(new Set([...base.map((c) => c.tpa_name), ...insurerFilters])).sort();
  }, [tabSearchScoped, statusFilters, breachOnly, insurerFilters]);

  // Badge counts every active narrowing dimension currently in effect:
  // status chips, insurer chips, breach toggle, search query, and non-default tab.
  const activeFilterCount =
    statusFilters.length +
    insurerFilters.length +
    (breachOnly ? 1 : 0) +
    (search.trim() ? 1 : 0) +
    (tab !== "critical" ? 1 : 0);

  const filtered = useMemo(() => {
    let list = tabSearchScoped;
    if (statusFilters.length) list = list.filter((c) => statusFilters.includes(c.claim_status));
    if (insurerFilters.length) list = list.filter((c) => insurerFilters.includes(c.tpa_name));
    if (breachOnly) list = list.filter((c) => c.is_irdai_breach);
    return list;
  }, [tabSearchScoped, statusFilters, insurerFilters, breachOnly]);

  const counts = {
    critical: roleFiltered.filter((c) => c.is_irdai_breach || c.days_since_claim >= 30).length,
    today: roleFiltered.filter((c) => !c.latest_follow_up).length,
    all: roleFiltered.length,
    done: roleFiltered.filter((c) => !!c.latest_follow_up).length,
  };

  function toggleIn(arr: string[], setter: (a: string[]) => void, v: string) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }
  function clearAllFilters() {
    setStatusFilters([]);
    setInsurerFilters([]);
    setBreachOnly(false);
  }

  function openDrawer(claim: ClaimWithMeta, mode: SheetMode = "full") {
    setActiveClaim(claim);
    setSheetMode(mode);
    setStep(mode === "date-only" ? 3 : 1);
    setOutcome(mode === "date-only" ? "callback" : null);
    setRefNumber("");
    setNotes("");
    setPromisedDate(addDays(7));
    setNextDateOption("3");
  }

  function handleOutcomeSelect(o: Outcome) {
    setOutcome(o);
    setStep(2);
  }

  async function handleSave() {
    if (!activeClaim || !outcome) return;
    setSaving(true);
    const nextDate =
      nextDateOption === "custom" ? promisedDate : addDays(parseInt(nextDateOption, 10));
    const payload: NewFollowUpInput = {
      claim_id: activeClaim.id,
      outcome,
      ref_number: refNumber || undefined,
      notes: notes || undefined,
      promised_date: outcome === "promised" ? promisedDate : undefined,
      next_action_date: nextDate,
    };
    try {
      await logFollowUp(payload);
      toast.success("Follow-up saved", {
        description: `Next action: ${new Date(nextDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
      });
      setActiveClaim(null);
    } catch (e) {
      toast.error("Failed to save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  // Quick-log "Reached SPOC" via right swipe — instant, with undo
  async function handleQuickLogReached(claim: ClaimWithMeta) {
    const nextDate = addDays(3);
    try {
      const created = await logFollowUp({
        claim_id: claim.id,
        outcome: "reached",
        next_action_date: nextDate,
      });
      toast.success("Logged: Reached SPOC", {
        description: `${claim.patient_name} · next ${new Date(nextDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await deleteFollowUp(created.id);
              toast.message("Undone");
            } catch (e) {
              toast.error("Undo failed");
            }
          },
        },
        duration: 5000,
      });
    } catch (e) {
      toast.error("Failed to log", { description: (e as Error).message });
    }
  }

  return (
    <AppLayout>
      {/* Desktop hint */}
      <div className="hidden md:flex flex-col items-center justify-center py-16 text-center gap-3">
        <div className="text-4xl">📱</div>
        <h2 className="text-xl font-display">Mobile Follow-Up View</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Designed for billing executives chasing TPAs from their phone — open on mobile for swipe gestures and one-tap call/log.
        </p>
        <Button onClick={() => navigate("/claims/priority")} variant="outline" size="sm">
          Open Priority Worklist
        </Button>
      </div>

      <div className="md:hidden -m-4 -mb-24 flex flex-col bg-background min-h-[calc(100vh-8rem)]">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border">
          <div className="flex items-center gap-2 px-3 pt-3 pb-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 -ml-2"
              onClick={() => navigate("/")}
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-display leading-tight truncate">Follow-Up</h1>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {role.toUpperCase()} view · {counts.today} pending · {counts.done} done
              </p>
            </div>
          </div>

          {/* Search + Filter */}
          <div className="px-3 pb-2 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Patient, claim no, TPA…"
                className="pl-9 pr-8 h-9 text-sm"
                inputMode="search"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full bg-muted text-muted-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <button
              onClick={() => setFilterOpen(true)}
              className={`relative flex-shrink-0 h-9 px-3 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 ${
                activeFilterCount > 0
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border"
              }`}
              aria-label="Filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filter
              {activeFilterCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary-foreground text-primary text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-2 pb-2 overflow-x-auto no-scrollbar">
            {([
              { id: "critical", label: "Critical", count: counts.critical },
              { id: "today",    label: "Pending",  count: counts.today },
              { id: "done",     label: "Done",     count: counts.done },
              { id: "all",      label: "All",      count: counts.all },
            ] as { id: Tab; label: string; count: number }[]).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border"
                }`}
              >
                {t.label}
                <span
                  className={`ml-1.5 tabular-nums ${
                    tab === t.id ? "opacity-90" : "text-muted-foreground"
                  }`}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-1 px-3 pb-2 overflow-x-auto no-scrollbar">
              {breachOnly && (
                <button
                  onClick={() => setBreachOnly(false)}
                  className="flex-shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full bg-destructive/15 text-destructive border border-destructive/30 text-[11px]"
                >
                  <ShieldAlert className="h-3 w-3" /> SLA breach <X className="h-3 w-3" />
                </button>
              )}
              {statusFilters.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleIn(statusFilters, setStatusFilters, s)}
                  className="flex-shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full bg-secondary/15 text-secondary-foreground border border-border text-[11px]"
                >
                  {s} <X className="h-3 w-3" />
                </button>
              ))}
              {insurerFilters.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleIn(insurerFilters, setInsurerFilters, s)}
                  className="flex-shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-full bg-accent/15 text-accent-foreground border border-border text-[11px] max-w-[180px]"
                >
                  <span className="truncate">{s}</span> <X className="h-3 w-3 flex-shrink-0" />
                </button>
              ))}
              <button
                onClick={clearAllFilters}
                className="flex-shrink-0 h-7 px-2 text-[11px] text-muted-foreground underline"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Swipe hint */}
          <div className="px-3 pb-2 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="text-success">→</span> Reached SPOC
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <span className="text-secondary">←</span> Set next date
            </span>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {loading && (
            <div className="space-y-2" data-testid="followup-skeleton">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="p-3 shadow-sm">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="h-5 w-10 rounded bg-muted animate-pulse" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-3/5 rounded bg-muted animate-pulse" />
                      <div className="h-3 w-2/5 rounded bg-muted animate-pulse" />
                    </div>
                    <div className="h-5 w-16 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-2.5 w-4/5 rounded bg-muted animate-pulse" />
                </Card>
              ))}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <p className="text-sm font-medium">All caught up</p>
              <p className="text-xs text-muted-foreground max-w-[260px]">
                {claims.length === 0
                  ? "No claims yet. Import a CSV to start chasing TPAs."
                  : search
                  ? `No matches for "${search}". Try clearing search or filters.`
                  : "No claims match this view. Switch tabs or clear filters."}
              </p>
              {(search || activeFilterCount > 0) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-8 text-xs"
                  onClick={() => {
                    setSearch("");
                    clearAllFilters();
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}
          {filtered.map((c) => {
            const log = c.latest_follow_up;
            const phone = c.patient_contact;
            return (
              <SwipeableCard
                key={c.id}
                onSwipeRight={() => handleQuickLogReached(c)}
                onSwipeLeft={() => openDrawer(c, "date-only")}
              >
                <Card
                  className="p-3 active:scale-[0.99] transition-transform shadow-sm"
                  onClick={() => openDrawer(c, "full")}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <Badge className={`text-[10px] px-1.5 py-0 h-5 tabular-nums ${ageBadge(c.days_since_claim, c.is_irdai_breach)}`}>
                      {c.is_irdai_breach && <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />}
                      {formatDays(c.days_since_claim)}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{c.patient_name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono leading-tight truncate">
                        {c.claim_number}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums leading-tight">
                        {formatInr(c.outstanding_amount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight">outstanding</p>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground truncate mb-2">{c.tpa_name}</p>

                  {log ? (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5 gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success flex-shrink-0" />
                        <span className="text-[11px] truncate">
                          {OUTCOMES.find((o) => o.id === log.outcome)?.label ?? log.outcome}
                        </span>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 ml-auto">
                          next {new Date(log.next_action_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <a
                          href={phone ? `tel:${phone}` : undefined}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-success text-success-foreground active:opacity-80"
                          aria-label="Call patient"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                        {(() => {
                          const waUrl = buildWhatsAppUrl(
                            phone,
                            tpaFollowUpMessage({
                              patient_name: c.patient_name,
                              claim_number: c.claim_number,
                              outstanding_amount: c.outstanding_amount,
                              days_since_claim: c.days_since_claim,
                              tpa_name: c.tpa_name,
                            }),
                          );
                          return (
                            <a
                              href={waUrl ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-whatsapp text-whatsapp-foreground active:opacity-80 aria-disabled:opacity-50"
                              aria-disabled={!waUrl}
                              aria-label="Open WhatsApp chat"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </a>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="keep-cols grid grid-cols-4 gap-1">
                      <a
                        href={phone ? `tel:${phone}` : undefined}
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 inline-flex items-center justify-center gap-1 h-8 rounded-md bg-success text-success-foreground text-[10px] font-medium active:opacity-80 disabled:opacity-50"
                        aria-label="Call patient"
                        title="Call"
                      >
                        <Phone className="h-3 w-3" />
                        <span className="hidden sm:inline">Call</span>
                      </a>
                      {(() => {
                        const waUrl = buildWhatsAppUrl(
                          phone,
                          tpaFollowUpMessage({
                            patient_name: c.patient_name,
                            claim_number: c.claim_number,
                            outstanding_amount: c.outstanding_amount,
                            days_since_claim: c.days_since_claim,
                            tpa_name: c.tpa_name,
                          }),
                        );
                        return (
                          <a
                            href={waUrl ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="min-w-0 inline-flex items-center justify-center gap-1 h-8 rounded-md bg-whatsapp text-whatsapp-foreground text-[10px] font-medium active:opacity-80 aria-disabled:opacity-50"
                            aria-disabled={!waUrl}
                            aria-label="Open WhatsApp chat"
                            title="WhatsApp"
                          >
                            <MessageSquare className="h-3 w-3" />
                            <span className="hidden sm:inline">WA</span>
                          </a>
                        );
                      })()}
                      <a
                        href={phone ? `sms:${phone}` : undefined}
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 inline-flex items-center justify-center gap-1 h-8 rounded-md bg-secondary text-secondary-foreground text-[10px] font-medium active:opacity-80"
                        aria-label="Send SMS"
                        title="SMS"
                      >
                        <MessageSquare className="h-3 w-3" />
                        <span className="hidden sm:inline">SMS</span>
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrawer(c, "full");
                        }}
                        className="min-w-0 inline-flex items-center justify-center gap-0.5 h-8 rounded-md bg-primary text-primary-foreground text-[10px] font-medium active:opacity-80"
                        aria-label="Log follow-up"
                        title="Log"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </Card>
              </SwipeableCard>
            );
          })}
        </div>
      </div>

      {/* Bottom drawer */}
      <Drawer open={!!activeClaim} onOpenChange={(o) => !o && setActiveClaim(null)}>
        <DrawerContent className="max-h-[92vh]">
          {activeClaim && (
            <>
              <DrawerHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-left min-w-0">
                    <DrawerTitle className="text-base truncate">{activeClaim.patient_name}</DrawerTitle>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                      {activeClaim.claim_number} · {formatInr(activeClaim.outstanding_amount)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setActiveClaim(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {sheetMode === "full" && (
                  <>
                    <div className="flex items-center gap-1 mt-2">
                      {[1, 2, 3].map((n) => (
                        <div
                          key={n}
                          className={`h-1 flex-1 rounded-full ${step >= n ? "bg-primary" : "bg-muted"}`}
                        />
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Step {step} of 3 · {step === 1 ? "What happened?" : step === 2 ? "Quick details" : "Next action"}
                    </p>
                  </>
                )}
                {sheetMode === "date-only" && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Set next follow-up date
                  </p>
                )}
              </DrawerHeader>

              <div className="px-4 pb-4 overflow-y-auto">
                {sheetMode === "full" && step === 1 && (
                  <div className="space-y-2">
                    {OUTCOMES.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => handleOutcomeSelect(o.id)}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left active:scale-[0.99] transition-transform ${o.tone}`}
                      >
                        <span className="text-xl">{o.icon}</span>
                        <span className="text-sm font-medium flex-1">{o.label}</span>
                        <ChevronRight className="h-4 w-4 opacity-60" />
                      </button>
                    ))}
                  </div>
                )}

                {sheetMode === "full" && step === 2 && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">TPA Reference / Token No</Label>
                      <Input
                        value={refNumber}
                        onChange={(e) => setRefNumber(e.target.value)}
                        placeholder="e.g. MA-2025-78421"
                        className="h-10 mt-1"
                      />
                    </div>
                    {outcome === "promised" && (
                      <div>
                        <Label className="text-xs">Promised Payment Date</Label>
                        <Input
                          type="date"
                          value={promisedDate}
                          onChange={(e) => setPromisedDate(e.target.value)}
                          className="h-10 mt-1"
                        />
                      </div>
                    )}
                    <div>
                      <Label className="text-xs">Notes (optional)</Label>
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Spoke to Ms. Reena, asked for discharge summary…"
                        className="mt-1 min-h-[72px] text-sm"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" className="flex-1 h-11" onClick={() => setStep(1)}>
                        Back
                      </Button>
                      <Button className="flex-1 h-11" onClick={() => setStep(3)}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}

                {(sheetMode === "date-only" || (sheetMode === "full" && step === 3)) && (
                  <div className="space-y-3">
                    <Label className="text-xs">When should we follow up next?</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: "1", label: "Tomorrow" },
                        { v: "3", label: "In 3 days" },
                        { v: "7", label: "In 1 week" },
                        { v: "custom", label: "Pick date" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          onClick={() => setNextDateOption(opt.v)}
                          className={`h-12 rounded-lg border text-sm font-medium ${
                            nextDateOption === opt.v
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {nextDateOption === "custom" && (
                      <Input
                        type="date"
                        value={promisedDate}
                        onChange={(e) => setPromisedDate(e.target.value)}
                        className="h-10"
                      />
                    )}
                    <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      Reminder will appear in your worklist on this date.
                    </div>
                    <div className="flex gap-2 pt-1">
                      {sheetMode === "full" && (
                        <Button variant="outline" className="flex-1 h-11" onClick={() => setStep(2)}>
                          Back
                        </Button>
                      )}
                      <Button className="flex-1 h-11" onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Follow-Up"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>

      {/* Filter bottom sheet */}
      <Drawer open={filterOpen} onOpenChange={setFilterOpen}>
        <DrawerContent className="max-h-[88vh]">
          <DrawerHeader className="pb-2">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-base">Filter claims</DrawerTitle>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearAllFilters}>
                Clear all
              </Button>
            </div>
          </DrawerHeader>

          <div className="px-4 pb-4 overflow-y-auto space-y-5">
            {/* Breach toggle */}
            <button
              onClick={() => setBreachOnly(!breachOnly)}
              className={`w-full flex items-center justify-between px-3 py-3 rounded-lg border ${
                breachOnly
                  ? "bg-destructive/10 border-destructive/40 text-destructive"
                  : "bg-background border-border"
              }`}
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                <div className="text-left">
                  <p className="text-sm font-medium">SLA breach only</p>
                  <p className="text-[11px] opacity-70">Claims past the regulatory TAT</p>
                </div>
              </div>
              <div
                className={`w-9 h-5 rounded-full relative transition-colors ${
                  breachOnly ? "bg-destructive" : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${
                    breachOnly ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </div>
            </button>

            {/* Status */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Status
                </Label>
                {statusFilters.length > 0 && (
                  <button
                    onClick={() => setStatusFilters([])}
                    className="text-[11px] text-muted-foreground underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {statusOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No statuses available.</p>
                )}
                {statusOptions.map((s) => {
                  const active = statusFilters.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleIn(statusFilters, setStatusFilters, s)}
                      className={`px-2.5 h-8 rounded-full text-xs border ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Insurer / TPA */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  TPA / Insurer
                </Label>
                {insurerFilters.length > 0 && (
                  <button
                    onClick={() => setInsurerFilters([])}
                    className="text-[11px] text-muted-foreground underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-1">
                {insurerOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No insurers available.</p>
                )}
                {insurerOptions.map((s) => {
                  const active = insurerFilters.includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleIn(insurerFilters, setInsurerFilters, s)}
                      className={`flex items-center justify-between px-3 h-10 rounded-md border text-sm text-left ${
                        active
                          ? "bg-primary/10 border-primary text-foreground"
                          : "bg-background border-border"
                      }`}
                    >
                      <span className="truncate flex-1">{s}</span>
                      {active && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button className="w-full h-11" onClick={() => setFilterOpen(false)}>
              Show {filtered.length} claim{filtered.length === 1 ? "" : "s"}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </AppLayout>
  );
}
