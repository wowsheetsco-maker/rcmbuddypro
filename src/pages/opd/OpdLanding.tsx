import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/lib/router-compat";
import {
  Stethoscope, Calendar, Activity, Users, ShieldCheck, CalendarClock,
  FileText, ListChecks, Receipt, BarChart3, ClipboardList, Building2,
  PartyPopper, UploadCloud, BellRing,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function OpdLanding() {
  const [kpis, setKpis] = useState({ visitsToday: 0, ahcOpen: 0, eventsPlanned: 0, corporates: 0 });

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [visits, ahc, events, corps] = await Promise.all([
        supabase.from("opd_visits").select("id", { count: "exact", head: true }).eq("visit_date", today),
        supabase.from("ahc_bookings").select("id", { count: "exact", head: true }).in("status", ["booked", "scheduled"]),
        supabase.from("wellness_events").select("id", { count: "exact", head: true }).eq("status", "planned"),
        supabase.from("opd_corporates").select("id", { count: "exact", head: true }).eq("is_active", true),
      ]);
      setKpis({
        visitsToday: visits.count ?? 0,
        ahcOpen: ahc.count ?? 0,
        eventsPlanned: events.count ?? 0,
        corporates: corps.count ?? 0,
      });
    })();
  }, []);

  const tiles = [
    { label: "OPD visits today", value: kpis.visitsToday, icon: Stethoscope, accent: "text-blue-500" },
    { label: "AHC bookings open", value: kpis.ahcOpen, icon: Calendar, accent: "text-amber-500" },
    { label: "Wellness events planned", value: kpis.eventsPlanned, icon: Activity, accent: "text-emerald-500" },
    { label: "Active corporates", value: kpis.corporates, icon: Users, accent: "text-purple-500" },
  ];

  const menu = [
    { label: "Corporates", path: "/opd/corporates", icon: Building2, desc: "Master + contracts" },
    { label: "Employees", path: "/opd/employees", icon: Users, desc: "Roster, wallets, dependents" },
    { label: "Eligibility check", path: "/opd/eligibility-check", icon: ShieldCheck, desc: "Instant ✅ / ❌ lookup" },
    { label: "Appointments", path: "/opd/appointments", icon: CalendarClock, desc: "Booking + provider confirmation" },
    { label: "Visits", path: "/opd/visits", icon: Stethoscope, desc: "Quick capture register" },
    { label: "Reports", path: "/opd/reports", icon: FileText, desc: "Submission tracker + SLA RAG" },
    { label: "Outstanding follow-up", path: "/opd/follow-up", icon: ListChecks, desc: "All operational backlogs" },
    { label: "Invoices", path: "/opd/invoices", icon: Receipt, desc: "Bulk per corporate + aging" },
    { label: "Tasks", path: "/opd/tasks", icon: ClipboardList, desc: "Assign & track" },
    { label: "Wellness events", path: "/opd/wellness-events", icon: PartyPopper, desc: "Camps + AHC outcomes" },
    { label: "Bulk submit", path: "/opd/bulk-submit", icon: UploadCloud, desc: "Aggregator batches" },
    { label: "Analytics", path: "/opd/analytics", icon: BarChart3, desc: "TAT, rejections, wallets" },
    { label: "Corporate analytics", path: "/opd/corporate-analytics", icon: BarChart3, desc: "Revenue & utilization by corporate" },
    { label: "Reminder audit log", path: "/opd/reminder-audit", icon: BellRing, desc: "24h & same-day provider reminders + delivery" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">OPD &amp; Wellness</h1>
          <p className="text-sm text-muted-foreground">Corporate OPD, AHC packages, teleconsult, pharmacy, diagnostics and wellness events.</p>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {tiles.map((t) => (
            <Card key={t.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs text-muted-foreground font-normal">{t.label}</CardTitle>
                <t.icon className={`h-4 w-4 ${t.accent}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{t.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Module menu</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {menu.map((m) => (
              <Link key={m.path} to={m.path} className="group">
                <Card className="h-full transition-colors hover:bg-accent/40 hover:border-primary/40">
                  <CardContent className="pt-5 pb-4">
                    <m.icon className="h-5 w-5 text-primary mb-2" />
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.desc}</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
