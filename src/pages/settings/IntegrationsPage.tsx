import { useMemo } from "react";
import { Link } from "@/lib/router-compat";
import {
  Bot, MessageSquare, Mail, Database, CheckCircle2, XCircle,
  Zap, ArrowRight, Sparkles, Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";
import { useAiProviders } from "@/hooks/useAiProviders";
import { useAppUsers } from "@/hooks/useAppUsers";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { useReminderSchedules } from "@/hooks/useReminderSchedules";

export default function IntegrationsPage() {
  const { providers, defaultProvider } = useAiProviders();
  const { users } = useAppUsers();
  const { templates } = useWhatsAppTemplates();
  const { schedules } = useReminderSchedules();

  const smtpVerified = useMemo(
    () => users.filter((u) => !!u.smtp_verified_at).length,
    [users],
  );
  const aiActive = providers.filter((p) => p.is_active).length;
  const waActive = templates.filter((t) => t.is_active).length;
  const automationActive = schedules.filter((s) => s.is_active).length;

  const integrations = [
    {
      name: "AI Providers",
      type: "AI Models",
      icon: Bot,
      enabled: aiActive > 0,
      status: defaultProvider
        ? `Default: ${defaultProvider.display_name}`
        : aiActive > 0 ? `${aiActive} provider(s) active` : "Not configured",
      desc: "Powers AI Reply, denial appeals, and follow-up enhancement.",
      href: "/settings/ai-providers",
    },
    {
      name: "User SMTP / Email",
      type: "Email",
      icon: Mail,
      enabled: smtpVerified > 0,
      status: smtpVerified > 0
        ? `${smtpVerified} of ${users.length} user(s) verified`
        : "No users have verified SMTP yet",
      desc: "Each user sends emails from their own SMTP. Falls back to platform sender.",
      href: "/settings/my-email",
    },
    {
      name: "WhatsApp Templates",
      type: "Messaging",
      icon: MessageSquare,
      enabled: waActive > 0,
      status: waActive > 0
        ? `${waActive} active template(s)`
        : "No templates",
      desc: "Click-to-chat composer with role-based templates (CFO / Billing / Ops).",
      href: "/communications/outstanding-reminders",
    },
    {
      name: "Reminder Automation",
      type: "Automation",
      icon: Zap,
      enabled: automationActive > 0,
      status: automationActive > 0
        ? `${automationActive} active rule(s) — runs every minute`
        : "No automation rules yet",
      desc: "Scheduled email reminders to TPAs / Insurers with claims attached as Excel.",
      href: "/communications/automation",
      highlight: true,
    },
    {
      name: "IHX Import",
      type: "Data",
      icon: Database,
      enabled: true,
      status: "CSV / Excel import via Import Claims",
      desc: "Bulk import of claim data with deduplication on claim number.",
      href: "/claims/import",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1100px]">
        <div>
          <h1 className="text-2xl font-display text-foreground">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live status of every connected system — AI, email, WhatsApp, automation and data import.
          </p>
        </div>

        {/* Highlighted automation card */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-accent/5">
          <CardContent className="py-5 px-6 flex items-center gap-5">
            <div className="p-3 rounded-xl bg-primary/15">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Set up automated follow-up emails</h2>
                <Badge className="bg-primary text-primary-foreground">New</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                Stop chasing TPAs manually. Define a schedule per insurer (or one
                global rule per aging bucket) and the system will email them
                pending claims, SLA breaches and discrepancies — with an Excel attached — automatically.
              </p>
            </div>
            <Button asChild>
              <Link to="/communications/automation">
                Open Automation <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3">
          {integrations.map((int) => {
            const Icon = int.icon;
            return (
              <Card key={int.name} className="shadow-sm">
                <CardContent className="py-4 px-5 flex items-center gap-4">
                  <div className={`p-2.5 rounded-lg ${int.enabled ? "bg-accent/15" : "bg-muted"}`}>
                    <Icon className={`h-5 w-5 ${int.enabled ? "text-accent-foreground" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold">{int.name}</h3>
                      <Badge variant="outline" className="text-[10px]">{int.type}</Badge>
                      {int.enabled ? (
                        <Badge variant="outline" className="bg-accent/15 text-accent-foreground border-accent/30 text-[10px] gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px] gap-1">
                          <XCircle className="h-3 w-3" /> Not configured
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{int.desc}</p>
                    <p className="text-[11px] text-foreground/70 mt-1 flex items-center gap-1">
                      {int.enabled
                        ? <CheckCircle2 className="h-3 w-3 text-accent-foreground" />
                        : <Users className="h-3 w-3 text-muted-foreground" />}
                      {int.status}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="text-xs h-8">
                    <Link to={int.href}>Configure <ArrowRight className="h-3 w-3" /></Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
