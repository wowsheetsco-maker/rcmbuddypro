import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import {
  Users, ShieldCheck, Hospital, Landmark, Bot, Mail, MessageSquare,
  FileText, Bell, Zap, BarChart3, Sparkles, Database, ArrowRight,
  Activity, Clock, BookOpen, Rocket, History, type LucideIcon,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminSubroles, type AdminSubrole } from "@/hooks/useAdminSubroles";

interface Section {
  label: string;
  path: string;
  icon: LucideIcon;
  desc: string;
  /** Admin subroles allowed to see this tile. Omit = any admin. */
  requiredSubroles?: AdminSubrole[];
}

const SECTIONS: Section[] = [
  { label: "Users",                path: "/settings/users",              icon: Users,         desc: "Invite team, assign roles & branches.",
    requiredSubroles: ["super_admin", "org_owner", "org_admin", "billing_admin"] },
  { label: "Permissions",          path: "/settings/permissions",        icon: ShieldCheck,   desc: "Fine-tune what each role can see and do.",
    requiredSubroles: ["super_admin", "org_owner"] },
  { label: "Access & Roles Guide", path: "/settings/access-guide",       icon: BookOpen,      desc: "Who can do what — with examples." },
  { label: "Onboarding Wizard",    path: "/settings/onboarding",         icon: Rocket,        desc: "Branches → staff → roles → scope.",
    requiredSubroles: ["super_admin", "org_owner", "org_admin"] },
  { label: "Access Audit Log",     path: "/settings/access-audit",       icon: History,       desc: "Every role & permission change, logged.",
    requiredSubroles: ["super_admin", "org_owner", "org_admin", "compliance_admin"] },
  { label: "Hospital Branches",    path: "/settings/hospital-branches",  icon: Hospital,      desc: "Manage groups, branches & merges.",
    requiredSubroles: ["super_admin", "org_owner", "org_admin"] },
  { label: "TPA / Insurers",       path: "/providers",                   icon: Landmark,      desc: "Master list of payers, contacts & SPOCs." },
  { label: "Integrations & AI",    path: "/settings/integrations",       icon: Bot,           desc: "AI providers, SMTP, WhatsApp, automation.",
    requiredSubroles: ["super_admin", "tech_admin"] },
  { label: "Email Templates",      path: "/settings/my-email",           icon: Mail,          desc: "Personal sender setup & saved templates." },
  { label: "WhatsApp Templates",   path: "/settings/whatsapp-templates", icon: MessageSquare, desc: "Approved message templates by role." },
  { label: "Subject Templates",    path: "/settings/subject-templates",  icon: FileText,      desc: "Standardised email subjects." },
  { label: "Notifications",        path: "/settings/notifications",      icon: Bell,          desc: "Per-user delivery & quiet hours." },
  { label: "Follow-up Automation", path: "/settings/followup-automation", icon: Zap,          desc: "Scheduled reminder rules.",
    requiredSubroles: ["super_admin", "org_owner", "org_admin", "tech_admin"] },
  { label: "Team Digests",         path: "/settings/team-digests",       icon: BarChart3,     desc: "Daily/weekly summary cadence." },
  { label: "Data Quality",         path: "/settings/dq-rules",           icon: Sparkles,      desc: "DQ rule library & thresholds.",
    requiredSubroles: ["super_admin", "org_owner", "org_admin", "compliance_admin"] },
  { label: "Data Management",      path: "/settings/data-management",    icon: Database,      desc: "Imports, exports & retention.",
    requiredSubroles: ["super_admin", "org_owner", "org_admin", "compliance_admin"] },
];

const REDIRECT_KEY = "rcm-admin-console-skip-redirect";

export function isSectionVisible(
  s: Section,
  subroles: Set<AdminSubrole>,
): boolean {
  if (!s.requiredSubroles || s.requiredSubroles.length === 0) return true;
  if (subroles.has("super_admin")) return true;
  return s.requiredSubroles.some((r) => subroles.has(r));
}

/** Used by HubTabBar to filter tabs by current user's admin subroles. */
export function filterAdminSectionsBySubroles(
  paths: string[],
  subroles: Set<AdminSubrole>,
): Set<string> {
  const allowed = new Set<string>();
  for (const s of SECTIONS) {
    if (isSectionVisible(s, subroles)) allowed.add(s.path);
  }
  // Paths not in SECTIONS (e.g. unknown) default to allowed.
  return new Set(paths.filter((p) => !SECTIONS.some((s) => s.path === p) || allowed.has(p)));
}

interface Stats {
  users: number | null;
  branches: number | null;
  providers: number | null;
  aiProviders: number | null;
  waTemplates: number | null;
  dqRules: number | null;
  lastLogin: { name: string | null; at: string | null } | null;
  recentUpdate: { name: string | null; at: string | null } | null;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return "—";
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function AdminConsolePage() {
  const { subroles, isLoading: subrolesLoading } = useAdminSubroles();
  const { orgId } = useAuth();

  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => isSectionVisible(s, subroles)),
    [subroles],
  );

  // Legacy redirect flag — consume & ignore (we always render the dashboard now).
  useEffect(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem(REDIRECT_KEY);
  }, []);


  const [stats, setStats] = useState<Stats>({
    users: null, branches: null, providers: null, aiProviders: null,
    waTemplates: null, dqRules: null, lastLogin: null, recentUpdate: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const count = (table: string) =>
        supabase.from(table as never).select("id", { count: "exact", head: true });
      const [users, branches, providers, ai, wa, dq, lastLogin, recent] = await Promise.all([
        count("app_users"),
        count("hospital_branches"),
        count("insurer_contacts"),
        count("ai_providers"),
        count("whatsapp_templates"),
        count("dq_rules"),
        supabase.from("app_users").select("name,last_login_at").order("last_login_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
        supabase.from("app_users").select("name,updated_at").order("updated_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setStats({
        users: users.count ?? null,
        branches: branches.count ?? null,
        providers: providers.count ?? null,
        aiProviders: ai.count ?? null,
        waTemplates: wa.count ?? null,
        dqRules: dq.count ?? null,
        lastLogin: lastLogin.data
          ? { name: (lastLogin.data as { name: string | null }).name, at: (lastLogin.data as { last_login_at: string | null }).last_login_at }
          : null,
        recentUpdate: recent.data
          ? { name: (recent.data as { name: string | null }).name, at: (recent.data as { updated_at: string | null }).updated_at }
          : null,
      });
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  if (subrolesLoading) return null;

  const quickStats: { label: string; value: number | null; icon: LucideIcon }[] = [
    { label: "Active users",   value: stats.users,       icon: Users },
    { label: "Branches",       value: stats.branches,    icon: Hospital },
    { label: "TPA / Insurer contacts", value: stats.providers, icon: Landmark },
    { label: "AI providers",   value: stats.aiProviders, icon: Bot },
    { label: "WA templates",   value: stats.waTemplates, icon: MessageSquare },
    { label: "DQ rules",       value: stats.dqRules,     icon: Sparkles },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1200px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground">Admin Console</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              One place for every admin setting — users, permissions, integrations, templates, automation and data.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            {visibleSections.length} of {SECTIONS.length} sections available
          </Badge>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {quickStats.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label}>
                <CardContent className="py-3 px-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    <span className="truncate">{s.label}</span>
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {s.value ?? "—"}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Last activity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>
            <CardContent className="py-3.5 px-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/15">
                <Activity className="h-4 w-4 text-accent-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Last sign-in</div>
                <div className="text-sm font-medium truncate">
                  {stats.lastLogin?.name ?? "—"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">{timeAgo(stats.lastLogin?.at)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3.5 px-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/15">
                <Clock className="h-4 w-4 text-accent-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Most recent user update</div>
                <div className="text-sm font-medium truncate">
                  {stats.recentUpdate?.name ?? "—"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground shrink-0">{timeAgo(stats.recentUpdate?.at)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Shortcuts grid */}
        <div>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Shortcuts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleSections.map((s) => {
              const Icon = s.icon;
              return (
                <Link key={s.path} to={s.path} className="group">
                  <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/5">
                    <CardContent className="py-4 px-5 flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-accent/15 shrink-0">
                        <Icon className="h-5 w-5 text-accent-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-semibold truncate">{s.label}</h3>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
          {visibleSections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              You don't have access to any admin sections. Contact your org owner.
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export function markAdminConsoleOverviewIntent() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(REDIRECT_KEY, "1");
}

/** Exported for HubTabBar to filter tabs in the Admin hub. */
export { SECTIONS as ADMIN_CONSOLE_SECTIONS };
