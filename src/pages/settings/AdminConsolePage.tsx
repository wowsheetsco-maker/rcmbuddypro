import { useEffect } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import {
  Users, ShieldCheck, Hospital, Landmark, Bot, Mail, MessageSquare,
  FileText, Bell, Zap, BarChart3, Sparkles, Database, ArrowRight,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";

const SECTIONS = [
  { label: "Users",                path: "/settings/users",              icon: Users,         desc: "Invite team, assign roles & branches." },
  { label: "Permissions",          path: "/settings/permissions",        icon: ShieldCheck,   desc: "Fine-tune what each role can see and do." },
  { label: "Hospital Branches",    path: "/settings/hospital-branches",  icon: Hospital,      desc: "Manage groups, branches & merges." },
  { label: "TPA / Insurers",       path: "/providers",                   icon: Landmark,      desc: "Master list of payers, contacts & SPOCs." },
  { label: "Integrations & AI",    path: "/settings/integrations",       icon: Bot,           desc: "AI providers, SMTP, WhatsApp, automation." },
  { label: "Email Templates",      path: "/settings/my-email",           icon: Mail,          desc: "Personal sender setup & saved templates." },
  { label: "WhatsApp Templates",   path: "/settings/whatsapp-templates", icon: MessageSquare, desc: "Approved message templates by role." },
  { label: "Subject Templates",    path: "/settings/subject-templates",  icon: FileText,      desc: "Standardised email subjects." },
  { label: "Notifications",        path: "/settings/notifications",      icon: Bell,          desc: "Per-user delivery & quiet hours." },
  { label: "Follow-up Automation", path: "/settings/followup-automation", icon: Zap,          desc: "Scheduled reminder rules." },
  { label: "Team Digests",         path: "/settings/team-digests",       icon: BarChart3,     desc: "Daily/weekly summary cadence." },
  { label: "Data Quality",         path: "/settings/dq-rules",           icon: Sparkles,      desc: "DQ rule library & thresholds." },
  { label: "Data Management",      path: "/settings/data-management",    icon: Database,      desc: "Imports, exports & retention." },
];

const REDIRECT_KEY = "rcm-admin-console-skip-redirect";

/**
 * Admin Console landing.
 *
 * Default behaviour: on first visit per tab session, redirects to the first
 * tab (Users). If the user explicitly opens the overview via the
 * "Admin Console overview" link, we skip the redirect and render the grid.
 */
export default function AdminConsolePage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const skip = sessionStorage.getItem(REDIRECT_KEY);
    if (skip) {
      sessionStorage.removeItem(REDIRECT_KEY);
      return;
    }
    navigate("/settings/users", { replace: true });
  }, [navigate]);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1200px]">
        <div>
          <h1 className="text-2xl font-display text-foreground">Admin Console</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            One place for every admin setting — users, permissions, integrations, templates, automation and data.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SECTIONS.map((s) => {
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
      </div>
    </AppLayout>
  );
}

/**
 * Call from a sidebar/command-palette entry that wants to show the overview
 * grid instead of redirecting straight to the first tab.
 */
export function markAdminConsoleOverviewIntent() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(REDIRECT_KEY, "1");
}
