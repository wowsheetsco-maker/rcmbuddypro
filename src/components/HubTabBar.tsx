import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import {
  Swords, BarChart3, MessageSquare, Network, Settings, Search, Sparkles, MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useActionCentreCounts } from "@/hooks/useActionCentreCounts";
import { useAdminSubroles } from "@/hooks/useAdminSubroles";
import { ADMIN_CONSOLE_SECTIONS, isSectionVisible } from "@/pages/settings/AdminConsolePage";
import { cn } from "@/lib/utils";


const MAX_VISIBLE_TABS = 6;

interface HubTab {
  label: string;
  path: string;
  /** Key into action-centre counts to show a numeric badge. */
  badge?: "overdue" | "irdai" | "outstanding";
}

interface Hub {
  key: string;
  label: string;
  icon: LucideIcon;
  tabs: HubTab[];
}

const HUBS: Hub[] = [
  {
    key: "claims",
    label: "Claims",
    icon: Search,
    tabs: [
      { label: "Claims",      path: "/claims" },
      { label: "Submission",  path: "/claims/submission" },
      { label: "Outstanding", path: "/claims/outstanding", badge: "outstanding" },
      { label: "Follow-Up",   path: "/claims/follow-up", badge: "overdue" },
      { label: "Priority",    path: "/claims/priority" },
      { label: "Discrepancy", path: "/claims/discrepancy" },
      { label: "Query",       path: "/claims/query" },
      { label: "Denials",     path: "/claims/denials" },
    ],
  },
  {
    key: "followups",
    label: "Follow-Ups",
    icon: MessageSquare,
    tabs: [
      { label: "Calendar",    path: "/communications/calendar", badge: "overdue" },
      { label: "AI Reply",    path: "/communications/ai-reply" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: BarChart3,
    tabs: [
      { label: "Payer Scorecard",     path: "/analytics/payer-scorecard" },
      { label: "Corporate Scorecard", path: "/analytics/corporate" },
      { label: "Staff Scorecard",     path: "/analytics/staff-scorecard" },
      { label: "Cashflow Trend",      path: "/analytics/cash-flow" },
    ],
  },
  {
    key: "admin",
    label: "Admin Console",
    icon: Settings,
    tabs: [
      { label: "Users",               path: "/settings/users" },
      { label: "Permissions",         path: "/settings/permissions" },
      { label: "Branches",            path: "/settings/hospital-branches" },
      { label: "TPA / Insurers",      path: "/providers" },
      { label: "Integrations & AI",   path: "/settings/integrations" },
      { label: "Email Templates",     path: "/settings/my-email" },
      { label: "WhatsApp Templates",  path: "/settings/whatsapp-templates" },
      { label: "Subject Templates",   path: "/settings/subject-templates" },
      { label: "Notifications",       path: "/settings/notifications" },
      { label: "Follow-up Automation", path: "/settings/followup-automation" },
      { label: "Team Digests",        path: "/settings/team-digests" },
      { label: "Data Quality",        path: "/settings/dq-rules" },
      { label: "Data Management",     path: "/settings/data-management" },
    ],
  },
];

export const ALL_HUBS = HUBS;

function formatCompact(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1000) return `₹${Math.round(n / 1000)}k`;
  return String(n);
}

export function getHubForPath(pathname: string): Hub | undefined {
  return HUBS.find((h) => h.tabs.some((t) => t.path === pathname));
}

export default function HubTabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const counts = useActionCentreCounts();
  const { subroles } = useAdminSubroles();
  const hub = useMemo(() => getHubForPath(pathname), [pathname]);
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  // Reset refs whenever the hub changes so we don't leak stale entries.
  useEffect(() => { tabRefs.current = []; }, [hub?.key]);

  if (!hub) return null;


  const badgeFor = (tab: HubTab): { text: string; tone: "danger" | "warn" } | null => {
    if (!tab.badge) return null;
    if (tab.badge === "overdue" && counts.overdueFollowUps > 0) {
      return { text: String(counts.overdueFollowUps), tone: "warn" };
    }
    if (tab.badge === "irdai" && counts.irdaiBreaches > 0) {
      return { text: String(counts.irdaiBreaches), tone: "danger" };
    }
    if (tab.badge === "outstanding" && counts.recoveryAtRisk > 0) {
      return { text: formatCompact(counts.recoveryAtRisk), tone: "danger" };
    }
    return null;
  };

  const HubIcon = hub.icon;
  const tabs = hub.key === "admin"
    ? hub.tabs.filter((t) => {
        const s = ADMIN_CONSOLE_SECTIONS.find((sec) => sec.path === t.path);
        return !s || isSectionVisible(s, subroles);
      })
    : hub.tabs;
  if (tabs.length === 0) return null;
  const activeIdx = tabs.findIndex((t) => t.path === pathname);
  const overflow = tabs.length > MAX_VISIBLE_TABS;
  let visible = tabs.slice(0, MAX_VISIBLE_TABS);
  let hidden = overflow ? tabs.slice(MAX_VISIBLE_TABS) : [];
  if (overflow && activeIdx >= MAX_VISIBLE_TABS) {
    const activeTab = tabs[activeIdx];
    visible = [...tabs.slice(0, MAX_VISIBLE_TABS - 1), activeTab];
    hidden = tabs.filter((t) => !visible.includes(t));
  }

  const focusTab = (idx: number) => {
    const node = tabRefs.current[idx];
    if (node) node.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>, idx: number) => {
    const last = visible.length - 1;
    let next = idx;
    if (e.key === "ArrowRight") next = idx === last ? 0 : idx + 1;
    else if (e.key === "ArrowLeft") next = idx === 0 ? last : idx - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(visible[idx].path);
      return;
    } else return;
    e.preventDefault();
    focusTab(next);
    // Activation follows focus, like ARIA "automatic" tabs
    navigate(visible[next].path);
  };

  return (
    <div className="sticky top-[calc(3rem+2.5rem)] z-[9] border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden">
      <div
        className="flex items-center gap-2 overflow-x-auto px-3 py-1.5 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={`${hub.label} sections`}
      >
        <div className="flex shrink-0 items-center gap-1.5 pr-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <HubIcon className="h-3.5 w-3.5" />
          {hub.label}
        </div>
        <div className="flex items-center gap-1">
          {visible.map((tab, idx) => {
            const active = tab.path === pathname;
            const b = badgeFor(tab);
            return (
              <Link
                key={tab.path}
                to={tab.path}
                ref={(el) => { tabRefs.current[idx] = el; }}
                role="tab"
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                tabIndex={active || (activeIdx === -1 && idx === 0) ? 0 : -1}
                onKeyDown={(e) => onKeyDown(e, idx)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[12.5px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  active
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
                {b && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-4 px-1 text-[9.5px] font-semibold tabular-nums",
                      b.tone === "danger"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {b.text}
                  </Badge>
                )}
              </Link>
            );
          })}
          {hidden.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  aria-label="More tabs"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  More
                  <Badge variant="outline" className="h-4 px-1 text-[9.5px]">{hidden.length}</Badge>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-1">
                {hidden.map((tab) => {
                  const active = tab.path === pathname;
                  return (
                    <Link
                      key={tab.path}
                      to={tab.path}
                      className={cn(
                        "block rounded px-2 py-1.5 text-[12.5px]",
                        active
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-muted",
                      )}
                    >
                      {tab.label}
                    </Link>
                  );
                })}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
}
