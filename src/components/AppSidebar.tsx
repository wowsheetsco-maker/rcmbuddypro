import { useState, useMemo, useEffect } from "react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import {
  LayoutDashboard, Search, ListChecks, Home,
  ShieldAlert, Calendar as CalendarIcon, Bot,
  Users, Landmark, ChevronDown,
  UserCog, Wallet, Briefcase, ShieldCheck,
  PanelLeftClose, PanelLeftOpen, Crown, AlertTriangle,
  Sparkles, Building2, TrendingUp, IndianRupee,
  Swords, BarChart3, MessageSquare, Network, Settings,
  Flame, LifeBuoy, LogOut, Shield, Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import rcmBrandLogo from "@/assets/rcm-buddy-logo.png";
import { useAuth, type OrgRole } from "@/contexts/AuthContext";
import { useIsPlatformAdmin } from "@/hooks/useIsPlatformAdmin";
import { usePlan } from "@/lib/usePlan";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { MoreHorizontal } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSidebarState } from "@/components/sidebar-context";
import { useActionCentreCounts } from "@/hooks/useActionCentreCounts";
import { getActingRole } from "@/hooks/useRolePermissions";
import type { UserRole } from "@/hooks/useAppUsers";

type Role = "cfo" | "billing" | "ops" | "admin";

/**
 * Map the matrix role (app_users.role / acting role) to the local persona
 * used for sidebar nav-visibility gates. Decision 1: sidebar persona is no
 * longer a separate user-chosen toggle — it is derived from the matrix role,
 * which the Permissions page is the source of truth for.
 */
function personaFromMatrixRole(r: UserRole): Role {
  switch (r) {
    case "Super Admin":
    case "Hospital Admin":
      return "admin";
    case "RCM Manager":
    case "Billing Executive":
      return "billing";
    case "Auditor":
    case "CFO View":
      return "cfo";
    default:
      return "admin";
  }
}

interface NavLeaf {
  label: string;
  path: string;
  icon?: LucideIcon;
  /** Local persona roles (CFO/Billing/Ops/Admin) that should see this leaf. Omit = visible to all. */
  roles?: Role[];
  /** Org-level Supabase roles allowed by AuthContext. Omit = visible to all signed-in users. */
  orgRoles?: OrgRole[];
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  /** If present, group is a single link (no children). */
  path?: string;
  children?: NavLeaf[];
  /** Local persona roles (CFO/Billing/Ops/Admin) that should see this group. Omit = visible to all. */
  roles?: Role[];
  /** Org-level Supabase roles allowed by AuthContext. Omit = visible to all signed-in users. */
  orgRoles?: OrgRole[];
}

const MAX_VISIBLE_PER_GROUP = 6;
const OPEN_GROUPS_STORAGE_KEY = "rcm-buddy-sidebar-open-groups";


const ROLE_META: Record<Role, { label: string; icon: LucideIcon; tagline: string }> = {
  cfo:     { label: "CFO",                icon: Wallet,      tagline: "Finance & cash view" },
  billing: { label: "Billing Manager",    icon: Briefcase,   tagline: "Claims & follow-ups" },
  ops:     { label: "Ops Coordinator",    icon: UserCog,     tagline: "Imports & contacts" },
  admin:   { label: "Admin",              icon: ShieldCheck, tagline: "Everything · ₹ controls" },
};

/**
 * Consolidated 8 top-level groups.
 * Routes themselves are unchanged — only navigation is restructured.
 */
/**
 * Flat enterprise sidebar — no dropdowns, no nesting.
 * Submenus surface as page-header tabs via HubTabBar.
 * Each entry deep-links to the first tab of its hub.
 */
const NAV_GROUPS: NavGroup[] = [
  { label: "Home",       icon: Home,            path: "/" },
  { label: "My Tasks",   icon: ListChecks,      path: "/my-tasks" },
  { label: "Dashboard",  icon: LayoutDashboard, path: "/dashboard", roles: ["cfo", "admin", "billing"] },
  { label: "Submission", icon: Search,          path: "/claims/payers" },
  { label: "Recovery",   icon: Flame,           path: "/claims/outstanding" },
  { label: "Recon",      icon: Network,         path: "/claims/discrepancy" },
  { label: "Follow-Ups", icon: CalendarIcon,    path: "/communications/calendar", roles: ["billing", "ops", "admin"] },
  { label: "Gov Schemes", icon: Landmark,       path: "/gov-schemes" },
  { label: "OPD & Wellness", icon: Stethoscope, path: "/opd" },
  { label: "Analytics",  icon: BarChart3,       path: "/analytics/payer-scorecard", orgRoles: ["owner", "admin"] },
  { label: "Admin Console", icon: Settings, path: "/settings", roles: ["admin", "ops", "billing"], orgRoles: ["owner", "admin"] },
];



function formatINRCompact(n: number): string {
  if (!n) return "₹0";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1000) return `₹${Math.round(n / 1000)}k`;
  return `₹${Math.round(n)}`;
}

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { role: orgRole, isLoading: authLoading } = useAuth();
  const { isAdmin: isPlatformAdmin } = useIsPlatformAdmin();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(OPEN_GROUPS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch { return {}; }
  });
  const [quickSearch, setQuickSearch] = useState("");
  const counts = useActionCentreCounts();

  // Persist open groups
  useEffect(() => {
    try { localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify(openGroups)); } catch { /* noop */ }
  }, [openGroups]);


  const [actingMatrixRole, setActingMatrixRole] = useState<UserRole>(() => getActingRole());
  useEffect(() => {
    const h = () => setActingMatrixRole(getActingRole());
    window.addEventListener("rcm-acting-role-change", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("rcm-acting-role-change", h);
      window.removeEventListener("storage", h);
    };
  }, []);
  const role: Role = useMemo(() => personaFromMatrixRole(actingMatrixRole), [actingMatrixRole]);

  // Auto-open the group containing the active route
  useEffect(() => {
    const active = NAV_GROUPS.find((g) =>
      g.children?.some((c) => c.path === location.pathname),
    );
    if (active) setOpenGroups((prev) => ({ ...prev, [active.label]: true }));
  }, [location.pathname]);

  // Role-filter nav:
  // - Local persona role gates (CFO/Billing/Ops/Admin) are now DERIVED from
  //   the matrix role (`app_users.role`), not a separate persona toggle.
  // - Org Supabase role gates come from AuthContext (owner/admin/member).
  // While AuthContext is still loading we don't apply the org-role filter to
  // avoid a visible "items pop in" flicker after login.
  const visibleNav = useMemo<NavGroup[]>(() => {
    const matchesPersona = (roles?: Role[]) => !roles || roles.includes(role);
    const matchesOrgRole = (orgRoles?: OrgRole[]) => {
      if (!orgRoles || orgRoles.length === 0) return true;
      if (authLoading) return true; // optimistic during initial load
      if (!orgRole) return false;
      return orgRoles.includes(orgRole);
    };
    const matchesAll = (g: NavGroup | NavLeaf) =>
      matchesPersona(g.roles) && matchesOrgRole(g.orgRoles);

    const out: NavGroup[] = [];
    for (const g of NAV_GROUPS) {
      if (!matchesAll(g)) continue;
      if (g.path && !g.children) { out.push(g); continue; }
      const kids = (g.children ?? []).filter(matchesAll);
      if (kids.length === 0) continue;
      out.push({ ...g, children: kids });
    }
    return out;
  }, [role, orgRole, authLoading]);


  // Action Centre badge counts per nav path
  const badgeByPath: Record<string, { text: string; tone: "danger" | "warn" | "info" }> = {};
  if (counts.overdueFollowUps > 0) {
    badgeByPath["/communications/calendar"] = { text: String(counts.overdueFollowUps), tone: "warn" };
    badgeByPath["/my-tasks"] = { text: String(counts.overdueFollowUps), tone: "warn" };
  }
  if (counts.irdaiBreaches > 0) {
    badgeByPath["/claims/priority"] = { text: String(counts.irdaiBreaches), tone: "danger" };
  }
  if (counts.recoveryAtRisk > 0) {
    badgeByPath["/claims/outstanding"] = {
      text: formatINRCompact(counts.recoveryAtRisk),
      tone: "danger",
    };
  }

  // Aggregated badge for a group: highest tone + sum of numeric counts
  const groupBadge = (g: NavGroup) => {
    if (!g.children) return undefined;
    let danger = false, warn = false, total = 0;
    for (const c of g.children) {
      const b = badgeByPath[c.path];
      if (!b) continue;
      if (b.tone === "danger") danger = true;
      else if (b.tone === "warn") warn = true;
      const n = parseInt(b.text, 10);
      if (!Number.isNaN(n)) total += n;
    }
    if (!danger && !warn) return undefined;
    return { tone: danger ? "danger" as const : "warn" as const, text: total > 0 ? String(total) : "" };
  };

  // INR-aware quick search
  const trimmedQuery = quickSearch.trim();
  const isCurrencyQuery = useMemo(() => {
    if (!trimmedQuery) return false;
    const q = trimmedQuery.toLowerCase();
    return /^(₹|rs\.?|inr)/i.test(q) || /^\d[\d,]*(\.\d+)?\s*(k|l|lakh|cr|crore)?$/i.test(q);
  }, [trimmedQuery]);

  const allNav = useMemo<NavLeaf[]>(() => {
    const out: NavLeaf[] = [];
    for (const g of visibleNav) {
      if (g.path) out.push({ label: g.label, path: g.path, icon: g.icon });
      g.children?.forEach((c) => out.push(c));
    }
    return out;
  }, [visibleNav]);

  const searchResults = useMemo(() => {
    if (!trimmedQuery) return [];
    const q = trimmedQuery.toLowerCase();
    return allNav.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 6);
  }, [allNav, trimmedQuery]);

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedQuery) return;
    if (isCurrencyQuery) {
      navigate("/claims/outstanding");
    } else if (searchResults.length > 0) {
      navigate(searchResults[0].path);
    } else {
      navigate(`/claims?q=${encodeURIComponent(trimmedQuery)}`);
    }
    setQuickSearch("");
    onNavigate?.();
  };

  const RoleIcon = ROLE_META[role].icon;

  const renderBadge = (path: string) => {
    const b = badgeByPath[path];
    if (!b) return null;
    const cls = b.tone === "danger"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : b.tone === "warn"
      ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400"
      : "bg-primary/15 text-primary border-primary/30";
    return (
      <Badge variant="outline" className={`ml-auto h-4 shrink-0 px-1 text-[10px] font-semibold ${cls}`}>
        {b.text}
      </Badge>
    );
  };

  const renderTopLink = (g: NavGroup) => {
    // Section-aware active state: each top-level link "owns" a URL prefix
    // so the right item highlights even on sub-tab routes.
    const sectionPrefixes: Record<string, string[]> = {
      "Home":       ["/"],
      "My Tasks":   ["/my-tasks", "/today", "/tasks"],
      "Dashboard":  ["/dashboard"],
      "Submission": ["/claims", "/claims/payers", "/claims/docs-to-submit", "/claims/submission", "/claims/query"],
      "Recovery":   ["/claims/outstanding", "/claims/follow-up", "/claims/priority", "/claims/ar", "/claims/denials", "/claims/denials-workflow", "/claims/appeals"],
      "Recon":      ["/claims/discrepancy", "/claims/reconciliation", "/claims/recon-alerts"],
      "Follow-Ups": ["/communications"],
      "Analytics":  ["/analytics"],
      "Admin Console": ["/settings", "/providers"],
    };
    const prefixes = sectionPrefixes[g.label] ?? [g.path!];
    const path = location.pathname;
    const isActive =
      g.label === "Home"
        ? path === "/"
        : g.label === "Dashboard"
        ? path === "/dashboard" || path.startsWith("/dashboard/")
        : prefixes.some((p) => path === p || (p !== "/" && path.startsWith(p + "/")));
    const Icon = g.icon;
    const badge = badgeByPath[g.path!];
    const link = (
      <Link
        to={g.path!}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={
          collapsed
            ? `relative mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? "bg-sidebar-primary/20 text-white shadow-[inset_0_0_0_1px_hsl(var(--sidebar-primary)/0.35)]"
                  : "text-white/70 hover:bg-sidebar-accent hover:text-white"
              }`
            : `group relative flex items-center gap-3 rounded-lg pl-3 pr-2.5 py-2 text-[13px] tracking-[-0.005em] transition-colors ${
                isActive
                  ? "bg-sidebar-primary/15 text-white font-semibold"
                  : "text-white/75 hover:bg-sidebar-accent hover:text-white"
              }`
        }
      >
        {isActive && !collapsed && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-sidebar-primary" />
        )}
        {isActive && collapsed && (
          <span className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-full bg-sidebar-primary" />
        )}
        <Icon className={`h-[17px] w-[17px] shrink-0 ${isActive ? "text-sidebar-primary" : ""}`} />
        {!collapsed && <span className="truncate">{g.label}</span>}
        {!collapsed && renderBadge(g.path!)}
        {collapsed && badge && (
          <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-sidebar ${badge.tone === "danger" ? "bg-destructive" : "bg-amber-500"}`} />
        )}
      </Link>
    );
    return collapsed ? (
      <Tooltip key={g.path}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {g.label}{badge ? ` · ${badge.text}` : ""}
        </TooltipContent>
      </Tooltip>
    ) : (
      <div key={g.path}>{link}</div>
    );
  };

  const renderGroup = (g: NavGroup) => {
    const Icon = g.icon;
    const childActive = g.children?.some((c) => c.path === location.pathname) ?? false;
    const isOpen = !!openGroups[g.label] || childActive;
    const aggBadge = groupBadge(g);

    if (collapsed) {
      // Show as icon button that links to first child; tooltip lists group
      const first = g.children?.[0];
      if (!first) return null;
      return (
        <Tooltip key={g.label}>
          <TooltipTrigger asChild>
            <Link
              to={first.path}
              onClick={onNavigate}
              className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                childActive
                  ? "bg-sidebar-primary/20 text-white shadow-[inset_0_0_0_1px_hsl(var(--sidebar-primary)/0.35)]"
                  : "text-white/70 hover:bg-sidebar-accent hover:text-white"
              }`}
            >
              {childActive && (
                <span className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-full bg-sidebar-primary" />
              )}
              <Icon className={`h-[17px] w-[17px] shrink-0 ${childActive ? "text-sidebar-primary" : ""}`} />
              {aggBadge && (
                <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-sidebar ${aggBadge.tone === "danger" ? "bg-destructive" : "bg-amber-500"}`} />
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {g.label}
            {aggBadge?.text ? <span className="ml-1.5 opacity-70">· {aggBadge.text}</span> : null}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Collapsible
        key={g.label}
        open={isOpen}
        onOpenChange={(o) => setOpenGroups((prev) => ({ ...prev, [g.label]: o }))}
      >
        <CollapsibleTrigger
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] tracking-[-0.005em] transition-colors ${
            childActive
              ? "text-white font-semibold"
              : "text-white/75 hover:bg-sidebar-accent hover:text-white"
          }`}
        >
          <Icon className={`h-[17px] w-[17px] shrink-0 ${childActive ? "text-sidebar-primary" : ""}`} />
          <span className="truncate">{g.label}</span>
          {aggBadge && aggBadge.text ? (
            <Badge
              variant="outline"
              className={`ml-auto h-4 px-1 text-[10px] font-semibold tabular-nums ${
                aggBadge.tone === "danger"
                  ? "bg-destructive/15 text-destructive border-destructive/30"
                  : "bg-amber-500/15 text-amber-300 border-amber-500/30"
              }`}
            >
              {aggBadge.text}
            </Badge>
          ) : aggBadge ? (
            <span className={`ml-auto h-1.5 w-1.5 rounded-full ${aggBadge.tone === "danger" ? "bg-destructive" : "bg-amber-500"}`} />
          ) : null}
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-white/50 transition-transform ${aggBadge ? "ml-1.5" : "ml-auto"} ${isOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-0.5 space-y-px pl-[26px] pr-1 relative">
          <span className="absolute left-[18px] top-1 bottom-1 w-px bg-sidebar-border/60" />
          {(() => {
            const kids = g.children!;
            const overflowing = kids.length > MAX_VISIBLE_PER_GROUP;
            const activeChild = kids.find((c) => c.path === location.pathname);
            let visible = overflowing ? kids.slice(0, MAX_VISIBLE_PER_GROUP) : kids;
            let hidden = overflowing ? kids.slice(MAX_VISIBLE_PER_GROUP) : [];
            if (activeChild && hidden.includes(activeChild)) {
              visible = [...kids.slice(0, MAX_VISIBLE_PER_GROUP - 1), activeChild];
              hidden = kids.filter((c) => !visible.includes(c));
            }
            return (
              <>
                {visible.map((c) => {
                  const isActive = c.path === location.pathname;
                  return (
                    <Link
                      key={c.path}
                      to={c.path}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors ${
                        isActive
                          ? "bg-sidebar-primary/15 text-white font-semibold"
                          : "text-white/65 hover:bg-sidebar-accent/70 hover:text-white"
                      }`}
                    >
                      {isActive && (
                        <span className="absolute -left-[8px] top-1.5 bottom-1.5 w-[2px] rounded-full bg-sidebar-primary" />
                      )}
                      <span className="truncate">{c.label}</span>
                      {renderBadge(c.path)}
                    </Link>
                  );
                })}
                {hidden.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[11.5px] text-white/55 hover:bg-sidebar-accent/60 hover:text-white"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                        <span>More ({hidden.length})</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="right" align="start" className="w-52 p-1">
                      {hidden.map((c) => {
                        const isActive = c.path === location.pathname;
                        return (
                          <Link
                            key={c.path}
                            to={c.path}
                            onClick={onNavigate}
                            className={`block rounded px-2 py-1.5 text-[12.5px] ${
                              isActive
                                ? "bg-primary/10 text-primary font-semibold"
                                : "text-foreground hover:bg-muted"
                            }`}
                          >
                            {c.label}
                          </Link>
                        );
                      })}
                    </PopoverContent>
                  </Popover>
                )}
              </>
            );
          })()}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const plan = usePlan();
  const planLabel = plan === "enterprise" ? "Enterprise Plan" : plan === "pro" ? "Pro Plan" : "Starter Plan";

  return (
    <TooltipProvider delayDuration={0}>
      {/* Brand */}
      <div
        className={
          collapsed
            ? "flex items-center justify-center px-2 pt-3 pb-1"
            : "flex items-center gap-2 px-3 pt-3 pb-1"
        }
      >
        <Link to="/" onClick={onNavigate} aria-label="RCM Buddy home" className="flex items-center">
          <img
            src={rcmBrandLogo}
            alt="RCM Buddy"
            className={collapsed ? "h-7 w-auto" : "h-9 w-auto"}
          />
        </Link>
      </div>

      {/* Role badge — read-only; derived from the matrix role (`app_users.role`).
          Use the "Acting as" switcher in the top bar to preview other roles. */}
      <div className={collapsed ? "px-2 pt-3 pb-2" : "px-3 pt-3 pb-2"}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                aria-label={`Role: ${actingMatrixRole}`}
                className="grid h-9 w-9 mx-auto place-items-center rounded-lg bg-sidebar-accent/70 text-sidebar-foreground"
              >
                <RoleIcon className="h-4 w-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              {actingMatrixRole} · {ROLE_META[role].tagline}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div
            aria-label="Current role"
            className="flex h-auto w-full items-center gap-2 rounded-lg border border-sidebar-border/40 bg-sidebar-accent/40 px-2.5 py-2 text-left text-sidebar-foreground"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-sidebar-primary/15 text-sidebar-primary-foreground">
              <RoleIcon className="h-3.5 w-3.5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] font-semibold leading-tight">
                {actingMatrixRole}
              </span>
              <span className="truncate text-[10.5px] text-sidebar-muted leading-tight mt-0.5">
                {planLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Keep quick-search refs alive but hidden — search lives in top bar ⌘K */}
      <div className="hidden">
        <form onSubmit={handleQuickSubmit}>
          <Input value={quickSearch} onChange={(e) => setQuickSearch(e.target.value)} />
        </form>
        <span>{isCurrencyQuery ? trimmedQuery : ""}</span>
        <span>{searchResults.length}</span>
      </div>

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto pt-1 pb-3 space-y-px ${collapsed ? "px-2" : "px-2.5"}`}>
        {visibleNav.map((g) => (g.path ? renderTopLink(g) : renderGroup(g)))}
      </nav>

      {/* Settings & Help — pinned */}
      <div className={`border-t border-sidebar-border/70 ${collapsed ? "px-2 py-2 space-y-1" : "px-2.5 py-2 space-y-px"}`}>
        {[
          ...(isPlatformAdmin ? [
            { label: "Org Access", path: "/admin/org-access", icon: Shield },
            { label: "Control Panel", path: "/admin", icon: Shield },
          ] : []),
          { label: "Settings", path: "/settings/users", icon: Settings },
          { label: "Help & Support", path: "/settings/integrations", icon: LifeBuoy },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          const link = (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={
                collapsed
                  ? `mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                      isActive
                        ? "bg-sidebar-primary/20 text-white"
                        : "text-white/65 hover:bg-sidebar-accent hover:text-white"
                    }`
                  : `flex items-center gap-3 rounded-lg px-3 py-2 text-[12.5px] transition-colors ${
                      isActive
                        ? "bg-sidebar-primary/15 text-white font-semibold"
                        : "text-white/65 hover:bg-sidebar-accent hover:text-white"
                    }`
              }
            >
              <Icon className="h-[17px] w-[17px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right" className="font-medium">{item.label}</TooltipContent>
            </Tooltip>
          ) : link;
        })}
      </div>

      {/* Footer */}
      <div className={`border-t border-sidebar-border ${collapsed ? "px-2 py-2 space-y-2" : "px-3 py-2.5 space-y-2"}`}>
        <SignOutButton collapsed={collapsed} />
        <div className={`text-[10px] text-sidebar-muted truncate tabular-nums ${collapsed ? "text-center" : ""}`}>
          {collapsed ? "v1.0" : `v1.0 · ${planLabel} · ₹ INR`}
        </div>
      </div>

    </TooltipProvider>
  );
}

function SignOutButton({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[SignOut] failed", err);
    } finally {
      setSigningOut(false);
      navigate("/login");
    }
  };

  const button = (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      aria-label="Sign out"
      className={
        collapsed
          ? "mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-sidebar-accent hover:text-white transition-colors disabled:opacity-50"
          : "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-white/75 hover:bg-sidebar-accent hover:text-white transition-colors disabled:opacity-50"
      }
    >
      <LogOut className="h-[17px] w-[17px] shrink-0" />
      {!collapsed && <span>{signingOut ? "Signing out…" : "Sign out"}</span>}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">Sign out</TooltipContent>
      </Tooltip>
    );
  }
  return button;
}

export default function AppSidebar() {
  const { collapsed, toggleCollapsed, isMobile, mobileOpen, setMobileOpen } = useSidebarState();

  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="w-64 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
        >
          <div className="flex h-full flex-col">
            <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 hidden md:flex flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ${
        collapsed ? "w-14" : "w-60"
      }`}
    >
      <SidebarBody collapsed={collapsed} />
      <button
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-16 grid h-6 w-6 place-items-center rounded-full border border-sidebar-border bg-card text-muted-foreground shadow-sm hover:text-foreground"
      >
        {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
      </button>
    </aside>
  );
}
