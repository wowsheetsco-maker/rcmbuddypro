import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, Search, ListChecks, ShieldAlert, Receipt, Upload,
  Calendar as CalendarIcon, Bot, Users, Landmark, Settings,
  CreditCard, FileWarning, User as UserIcon, Building2, Mail, Phone,
  Hospital, Clock, History, AlertTriangle,
} from "lucide-react";
import { markAdminConsoleOverviewIntent } from "@/pages/settings/AdminConsolePage";
import { Badge } from "@/components/ui/badge";
import { formatInrShort, formatDays, getStatusColor } from "@/data/mockClaims";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useInsurerContacts } from "@/hooks/useInsurerContacts";
import { useHospitals } from "@/hooks/useHospitals";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial query text (used when user starts typing in the inline search). */
  initialQuery?: string;
}

type Scope = "all" | "claims" | "payers" | "hospitals" | "contacts" | "pages";

const SCOPES: { id: Scope; label: string; shortcut?: string }[] = [
  { id: "all",       label: "All",       shortcut: "1" },
  { id: "claims",    label: "Claims",    shortcut: "2" },
  { id: "payers",    label: "Payers",    shortcut: "3" },
  { id: "hospitals", label: "Hospitals", shortcut: "4" },
  { id: "contacts",  label: "Contacts",  shortcut: "5" },
  { id: "pages",     label: "Pages",     shortcut: "6" },
];

const NAV_COMMANDS = [
  { label: "Dashboard",            path: "/",                            icon: LayoutDashboard, keywords: "home overview" },
  { label: "All Claims",           path: "/claims",                      icon: Search,          keywords: "list" },
  { label: "Priority Worklist",    path: "/claims/priority",             icon: ListChecks,      keywords: "todo queue" },
  { label: "Denial & Query",       path: "/claims/denials",              icon: FileWarning,     keywords: "rejected" },
  { label: "SLA Tracker",        path: "/claims/priority",                icon: ShieldAlert,     keywords: "breach compliance" },
  { label: "Discrepancy Tracker",  path: "/claims/discrepancy",          icon: AlertTriangle,   keywords: "shortfall mismatch" },
  { label: "Data Quality",         path: "/claims/data-quality",         icon: ShieldAlert,     keywords: "dq clean" },
  { label: "TDS Report",           path: "/claims/tds",                  icon: Receipt,         keywords: "tax" },
  { label: "Import Claims",        path: "/claims/import",               icon: Upload,          keywords: "upload csv excel" },
  { label: "Cash Flow Forecast",   path: "/analytics/cash-flow",         icon: CreditCard,      keywords: "money projection" },
  { label: "Payer Scorecard",      path: "/analytics/payer-scorecard",   icon: Landmark,        keywords: "tpa insurer ranking" },
  { label: "TPA Report",           path: "/analytics/tpa-report",        icon: Landmark,        keywords: "" },
  { label: "Trends Analytics",     path: "/analytics/trends",            icon: Landmark,        keywords: "" },
  { label: "Corporate Performance", path: "/analytics/corporate",        icon: Landmark,        keywords: "" },
  { label: "Follow-up Calendar",   path: "/communications/calendar",     icon: CalendarIcon,    keywords: "schedule" },
  { label: "Follow-up Engine",     path: "/communications/follow-up",    icon: CalendarIcon,    keywords: "" },
  { label: "AI Reply",             path: "/communications/ai-reply",     icon: Bot,             keywords: "draft" },
  { label: "Outstanding Reminders", path: "/communications/outstanding", icon: CalendarIcon,    keywords: "" },
  { label: "Contacts",             path: "/providers/contacts",          icon: Users,           keywords: "spoc" },
  { label: "TPA / Insurers",       path: "/providers",                   icon: Landmark,        keywords: "" },
  { label: "Admin Console",        path: "/settings",                    icon: Settings,        keywords: "settings users permissions branches integrations ai providers templates notifications automation digests data quality dq" },
];

const RECENTS_KEY = "rcm-buddy-search-recents";
const RECENTS_MAX = 5;

function loadRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, RECENTS_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecent(term: string) {
  const t = term.trim();
  if (!t || t.length < 2) return;
  const current = loadRecents().filter((r) => r.toLowerCase() !== t.toLowerCase());
  const next = [t, ...current].slice(0, RECENTS_MAX);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function clearRecents() {
  try {
    localStorage.removeItem(RECENTS_KEY);
  } catch {
    /* ignore */
  }
}

export default function CommandPalette({ open, onOpenChange, initialQuery = "" }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState<Scope>("all");
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  const { claims } = useLiveClaims();
  const { contacts } = useInsurerContacts();
  const { groups, branches } = useHospitals();

  // Sync external initial query when palette opens; reset on close
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setScope("all");
      setRecents(loadRecents());
    } else {
      setQuery("");
    }
  }, [open, initialQuery]);

  // Scope hot-keys (1–6) when palette is open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Only trigger when alt/meta is held — avoids fighting normal typing
      if (!(e.altKey || e.metaKey)) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < SCOPES.length) {
        e.preventDefault();
        setScope(SCOPES[idx].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const q = query.trim().toLowerCase();
  const showAll = scope === "all";

  // ---------- CLAIMS ----------
  const claimResults = useMemo(() => {
    if (scope !== "all" && scope !== "claims") return [];
    if (!q) return scope === "claims" ? claims.slice(0, 12) : claims.slice(0, 4);
    return claims
      .filter((c) =>
        c.claim_number?.toLowerCase().includes(q) ||
        c.ihx_ref_id?.toLowerCase().includes(q) ||
        c.patient_name?.toLowerCase().includes(q) ||
        c.tpa_name?.toLowerCase().includes(q) ||
        (c.insurance_company_name ?? "").toLowerCase().includes(q) ||
        (c.policy_number ?? "").toLowerCase().includes(q) ||
        (c.hospital_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, scope === "claims" ? 25 : 6);
  }, [claims, q, scope]);

  // ---------- PAYERS ----------
  const payerResults = useMemo(() => {
    if (scope !== "all" && scope !== "payers") return [];
    const map = new Map<string, { name: string; type: "tpa" | "insurer"; count: number; outstanding: number }>();
    for (const c of claims) {
      if (c.tpa_name) {
        const k = `tpa::${c.tpa_name}`;
        const e = map.get(k) ?? { name: c.tpa_name, type: "tpa" as const, count: 0, outstanding: 0 };
        e.count += 1;
        e.outstanding += c.outstanding_amount || 0;
        map.set(k, e);
      }
      if (c.insurance_company_name) {
        const k = `ins::${c.insurance_company_name}`;
        const e = map.get(k) ?? { name: c.insurance_company_name, type: "insurer" as const, count: 0, outstanding: 0 };
        e.count += 1;
        e.outstanding += c.outstanding_amount || 0;
        map.set(k, e);
      }
    }
    const all = Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
    if (!q) return all.slice(0, scope === "payers" ? 20 : 4);
    return all.filter((p) => p.name.toLowerCase().includes(q)).slice(0, scope === "payers" ? 20 : 6);
  }, [claims, q, scope]);

  // ---------- HOSPITALS (groups + branches) ----------
  const hospitalResults = useMemo(() => {
    if (scope !== "all" && scope !== "hospitals") return [];
    type Row =
      | { kind: "group"; id: string; name: string; branchCount: number }
      | { kind: "branch"; id: string; name: string; groupName: string; city: string | null };
    const groupBranchCount = new Map<string, number>();
    for (const b of branches) {
      groupBranchCount.set(b.group_id, (groupBranchCount.get(b.group_id) ?? 0) + 1);
    }
    const groupRows: Row[] = groups.map((g) => ({
      kind: "group",
      id: g.id,
      name: g.name,
      branchCount: groupBranchCount.get(g.id) ?? 0,
    }));
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
    const branchRows: Row[] = branches.map((b) => ({
      kind: "branch",
      id: b.id,
      name: b.name,
      groupName: groupNameById.get(b.group_id) ?? "",
      city: b.city,
    }));
    const all = [...groupRows, ...branchRows];
    if (!q) return all.slice(0, scope === "hospitals" ? 20 : 4);
    return all
      .filter((r) => {
        if (r.kind === "group") return r.name.toLowerCase().includes(q);
        return (
          r.name.toLowerCase().includes(q) ||
          r.groupName.toLowerCase().includes(q) ||
          (r.city ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, scope === "hospitals" ? 25 : 6);
  }, [groups, branches, q, scope]);

  // ---------- CONTACTS ----------
  const contactResults = useMemo(() => {
    if (scope !== "all" && scope !== "contacts") return [];
    if (!q && scope === "all") return [];
    if (!q) return contacts.slice(0, 12);
    return contacts
      .filter((c) =>
        c.contact_name.toLowerCase().includes(q) ||
        c.provider.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
      )
      .slice(0, scope === "contacts" ? 20 : 6);
  }, [contacts, q, scope]);

  // ---------- PAGES ----------
  const pageResults = useMemo(() => {
    if (scope !== "all" && scope !== "pages") return [];
    if (!q) return scope === "pages" ? NAV_COMMANDS : NAV_COMMANDS.slice(0, 6);
    return NAV_COMMANDS.filter(
      (n) => n.label.toLowerCase().includes(q) || (n.keywords ?? "").includes(q),
    );
  }, [q, scope]);

  const totalCount =
    claimResults.length + payerResults.length + hospitalResults.length + contactResults.length + pageResults.length;

  const handleSelect = (path: string) => {
    saveRecent(query);
    onOpenChange(false);
    navigate(path);
  };

  const placeholderByScope: Record<Scope, string> = {
    all:       "Search claim, payer, hospital, contact, or jump to a page…",
    claims:    "Search claim no, IHX ref, patient, policy, hospital…",
    payers:    "Search TPA or insurer…",
    hospitals: "Search hospital group, branch, or city…",
    contacts:  "Search contact name, provider, email, phone…",
    pages:     "Jump to a page…",
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={placeholderByScope[scope]}
      />

      {/* Scope tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {SCOPES.map((s) => {
          const active = scope === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-pressed={active}
            >
              {s.label}
              {s.shortcut && (
                <kbd
                  className={cn(
                    "rounded px-1 py-0 text-[9px] font-mono",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted-foreground/10 text-muted-foreground",
                  )}
                >
                  ⌥{s.shortcut}
                </kbd>
              )}
            </button>
          );
        })}
        {q && (
          <span className="ml-auto pr-1 text-[11px] text-muted-foreground tabular-nums">
            {totalCount} result{totalCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <CommandList className="max-h-[440px]">
        <CommandEmpty>
          <div className="py-2">
            <p className="text-sm">No results for “{query}”.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a claim number, patient name, payer, hospital, or page name.
            </p>
          </div>
        </CommandEmpty>

        {/* Recent searches — only when no query and on All scope */}
        {!q && showAll && recents.length > 0 && (
          <CommandGroup heading="Recent searches">
            {recents.map((r) => (
              <CommandItem
                key={r}
                value={`recent ${r}`}
                onSelect={() => setQuery(r)}
                className="gap-3"
              >
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="text-[13px]">{r}</span>
              </CommandItem>
            ))}
            <CommandItem
              value="recent clear"
              onSelect={() => {
                clearRecents();
                setRecents([]);
              }}
              className="gap-3 text-muted-foreground"
            >
              <span className="ml-7 text-[11.5px]">Clear recent searches</span>
            </CommandItem>
          </CommandGroup>
        )}

        {claimResults.length > 0 && (
          <>
            {!q && showAll && recents.length > 0 && <CommandSeparator />}
            <CommandGroup heading={q ? `Claims (${claimResults.length})` : "Recent claims"}>
              {claimResults.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`claim ${c.claim_number} ${c.ihx_ref_id ?? ""} ${c.patient_name} ${c.tpa_name} ${c.policy_number ?? ""} ${c.hospital_name ?? ""}`}
                  onSelect={() => handleSelect(`/claims?openClaim=${encodeURIComponent(c.id)}`)}
                  className="gap-3"
                >
                  <UserIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                      <span className="truncate">{c.patient_name}</span>
                      <span className="font-mono text-[10.5px] font-normal text-muted-foreground">
                        #{c.claim_number}
                      </span>
                      {c.is_irdai_breach && (
                        <Badge className="h-4 border-0 bg-destructive px-1 text-[9px] text-destructive-foreground">
                          SLA
                        </Badge>
                      )}
                    </span>
                    <span className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                      <Badge
                        variant="outline"
                        className={cn("h-4 border-0 px-1 text-[9px]", getStatusColor(c.claim_status))}
                      >
                        {c.claim_status}
                      </Badge>
                      <span className="truncate">{c.tpa_name}</span>
                      {c.hospital_name && <span className="truncate">· {c.hospital_name}</span>}
                    </span>
                  </div>
                  <div className="ml-2 flex shrink-0 flex-col items-end">
                    <span className="text-[11px] tabular-nums font-medium text-foreground">
                      {formatInrShort(c.outstanding_amount || c.claimed_amount)}
                    </span>
                    <span className="flex items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDays(c.days_since_claim)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {payerResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={q ? `Payers (${payerResults.length})` : "Top payers by outstanding"}>
              {payerResults.map((p) => (
                <CommandItem
                  key={`${p.type}-${p.name}`}
                  value={`payer ${p.name} ${p.type}`}
                  onSelect={() =>
                    handleSelect(
                      `/analytics/tpa-report?payer=${encodeURIComponent(p.name)}&type=${p.type}`,
                    )
                  }
                  className="gap-3"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">{p.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {p.type === "tpa" ? "TPA" : "Insurer"} · {p.count} claim{p.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="ml-2 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatInrShort(p.outstanding)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {hospitalResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={q ? `Hospitals (${hospitalResults.length})` : "Hospital groups & branches"}>
              {hospitalResults.map((h) => (
                <CommandItem
                  key={`${h.kind}-${h.id}`}
                  value={`hospital ${h.kind} ${h.name} ${h.kind === "branch" ? `${h.groupName} ${h.city ?? ""}` : ""}`}
                  onSelect={() =>
                    handleSelect(
                      h.kind === "group"
                        ? `/settings/hospital-branches?group=${encodeURIComponent(h.id)}`
                        : `/settings/hospital-branches?branch=${encodeURIComponent(h.id)}`,
                    )
                  }
                  className="gap-3"
                >
                  <Hospital className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">
                      {h.kind === "branch" ? `${h.groupName} — ${h.name}` : h.name}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {h.kind === "group"
                        ? `Group · ${h.branchCount} branch${h.branchCount === 1 ? "" : "es"}`
                        : `Branch${h.city ? ` · ${h.city}` : ""}`}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {contactResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Contacts (${contactResults.length})`}>
              {contactResults.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`contact ${c.contact_name} ${c.provider} ${c.email}`}
                  onSelect={() => handleSelect("/providers/contacts")}
                  className="gap-3"
                >
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">
                      {c.contact_name}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        {c.provider}
                      </span>
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </span>
                  </div>
                  {c.phone && <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {pageResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={scope === "pages" ? `Pages (${pageResults.length})` : "Navigate"}>
              {pageResults.map((n) => {
                const Icon = n.icon;
                return (
                  <CommandItem
                    key={n.path}
                    value={`nav ${n.label} ${n.keywords ?? ""}`}
                    onSelect={() => handleSelect(n.path)}
                    className="gap-3"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-[13px]">{n.label}</span>
                    <span className="ml-auto text-[10.5px] text-muted-foreground/70">{n.path}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* Footer hint */}
      <div className="flex items-center justify-between border-t px-3 py-1.5 text-[10.5px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↑↓</kbd>
          navigate
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↵</kbd>
          open
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">esc</kbd>
          close
        </span>
        <span className="hidden sm:inline">
          <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">⌥1–6</kbd>
          switch scope
        </span>
      </div>
    </CommandDialog>
  );
}
