import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Landmark, FileCheck, AlertTriangle, IndianRupee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface GovKpis {
  preauthPending: number;
  claimsPending: number;
  deductionTotal: number;
  empanelmentExpiringSoon: number;
}

export default function GovSchemesLanding() {
  const [kpis, setKpis] = useState<GovKpis>({
    preauthPending: 0, claimsPending: 0, deductionTotal: 0, empanelmentExpiringSoon: 0,
  });

  useEffect(() => {
    (async () => {
      const [preauth, claims, deductions] = await Promise.all([
        supabase.from("gov_claims").select("id", { count: "exact", head: true }).eq("claim_status", "preauth_pending"),
        supabase.from("gov_claims").select("id", { count: "exact", head: true }).in("claim_status", ["claim_submitted", "query_raised", "approved"]),
        supabase.from("gov_claim_deductions").select("amount"),
      ]);
      const ded = (deductions.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
      setKpis({
        preauthPending: preauth.count ?? 0,
        claimsPending: claims.count ?? 0,
        deductionTotal: ded,
        empanelmentExpiringSoon: 0,
      });
    })();
  }, []);

  const tiles = [
    { label: "Pre-auth pending", value: kpis.preauthPending, icon: AlertTriangle, accent: "text-amber-500" },
    { label: "Claims in process", value: kpis.claimsPending, icon: FileCheck, accent: "text-blue-500" },
    { label: "Deductions (₹)", value: `₹${Math.round(kpis.deductionTotal).toLocaleString("en-IN")}`, icon: IndianRupee, accent: "text-rose-500" },
    { label: "Empanelment expiring", value: kpis.empanelmentExpiringSoon, icon: Landmark, accent: "text-emerald-500" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">Government Schemes</h1>
          <p className="text-sm text-muted-foreground">PMJAY, CGHS, ECHS, ESIC and state schemes — pre-auth, claims, deductions and empanelment.</p>
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
              <li>Phase 2: PMJAY pre-auth tracker, packages master, claims list, doc checklist, deduction analytics</li>
              <li>Phase 4: CGHS / ECHS / ESIC and state schemes, empanelment renewals</li>
              <li>Phase 5: AI appeal letters for scheme-specific deductions</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
