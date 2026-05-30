import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stethoscope, Calendar, Activity, Users } from "lucide-react";
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

        <Card>
          <CardHeader><CardTitle>Module roadmap</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">Phase 1 (current): schema, navigation and zero-state KPIs.</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Phase 3: visit capture (mobile-first), corporate + employee master, aggregator import, batch builder</li>
              <li>Phase 4: AHC booking funnel, wellness event ROI, settlement reconciliation</li>
              <li>Phase 5: aggregator eligibility APIs, auto-escalation rules</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
