import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";
import { Users, Package, Inbox, FileText, BarChart3, MessageSquare } from "lucide-react";

const TILES = [
  { to: "/wellness/providers", icon: Users, title: "Providers & Contracts", desc: "Wellness payors, contract dates, SPOC, billing email." },
  { to: "/wellness/packages",  icon: Package, title: "Packages", desc: "Per-provider consultations and health checks with pricing." },
  { to: "/wellness/requests",  icon: Inbox, title: "Requests Inbox", desc: "Incoming requests — confirm, reschedule, cancel, send report. Audit timeline per request." },
  { to: "/wellness/templates", icon: MessageSquare, title: "Message Templates", desc: "Customize confirmation, reschedule, cancel and report messages (email + WhatsApp)." },
  { to: "/wellness/invoices",  icon: FileText, title: "Invoices", desc: "Monthly invoices to wellness payors. Auto-generated on the 1st of each month." },
  { to: "/wellness/dashboard", icon: BarChart3, title: "Management Report", desc: "Per-provider revenue, utilisation, outstanding by month." },
];

export default function OpdLanding() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">Wellness / OPD</h1>
          <p className="text-sm text-muted-foreground">Lean workflow: provider contracts → packages → requests → reports → invoices.</p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {TILES.map((t) => (
            <Link key={t.to} to={t.to as any}>
              <Card className="hover:bg-accent/40 transition cursor-pointer h-full">
                <CardContent className="pt-5 space-y-2">
                  <t.icon className="h-5 w-5 text-primary" />
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">{t.desc}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
