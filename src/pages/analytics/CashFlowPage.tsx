import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Loader2, Wallet, TrendingUp, AlertTriangle, Ban } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { formatInrShort } from "@/data/mockClaims";
import { useLiveClaims } from "@/hooks/useLiveClaims";

const SETTLED = new Set(["settled", "paid", "closed"]);

/**
 * Forecast based on age buckets of outstanding amounts:
 * 0-15d → "This Week", 16-30d → "Next Week", 31-45d → "Week 3",
 * 46-60d → "Week 4", 61-90d → "Month 2", 90+d → "Month 3" (likely write-off).
 */
export default function CashFlowPage() {
  const { claims, loading, isMock } = useLiveClaims();

  const { forecast, summary } = useMemo(() => {
    const buckets = { w1: 0, w2: 0, w3: 0, w4: 0, m2: 0, m3: 0 };
    let totalPending = 0;
    let received30 = 0;
    let over90 = 0;

    for (const c of claims) {
      const out = c.outstanding_amount || 0;
      if (out > 0) {
        totalPending += out;
        const age = c.days_since_claim;
        if (age <= 15) buckets.w1 += out;
        else if (age <= 30) buckets.w2 += out;
        else if (age <= 45) buckets.w3 += out;
        else if (age <= 60) buckets.w4 += out;
        else if (age <= 90) buckets.m2 += out;
        else { buckets.m3 += out; over90 += out; }
      }
      // Received in the last 30 days
      if (SETTLED.has(c.claim_status.toLowerCase()) && c.payment_update_date) {
        const days = Math.floor((Date.now() - new Date(c.payment_update_date).getTime()) / 86_400_000);
        if (days >= 0 && days <= 30) received30 += c.settled_amount || 0;
      }
    }

    const expectedThisMonth = buckets.w1 + buckets.w2 + buckets.w3 + buckets.w4;
    // Likely write-offs ≈ 30% of >90d bucket (industry rule of thumb)
    const writeoffs = Math.round(over90 * 0.3);

    return {
      forecast: [
        { period: "0-15d (This Wk)", expected: buckets.w1, actual: 0 },
        { period: "16-30d", expected: buckets.w2, actual: 0 },
        { period: "31-45d", expected: buckets.w3, actual: 0 },
        { period: "46-60d", expected: buckets.w4, actual: 0 },
        { period: "61-90d", expected: buckets.m2, actual: 0 },
        { period: "90d+ (write-off risk)", expected: buckets.m3, actual: 0 },
      ],
      summary: [
        { label: "Total Pending AR", value: totalPending, icon: Wallet, tone: "text-primary" as const, caption: "All outstanding" },
        { label: "Expected (≤60d)", value: buckets.w1 + buckets.w2 + buckets.w3 + buckets.w4, icon: TrendingUp, tone: "text-success" as const, caption: "Likely inflows" },
        { label: "90+ Days Outstanding", value: over90, icon: AlertTriangle, tone: "text-warning" as const, caption: "At risk" },
        { label: "Likely Write-offs (est.)", value: writeoffs, icon: Ban, tone: "text-destructive" as const, caption: "30% of 90d+" },
      ],
      receivedLast30: received30,
      expectedThisMonth,
    };
  }, [claims]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display text-foreground">Cash Flow Forecast</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            Projected cash inflows by ageing bucket of outstanding claims
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            {isMock && !loading && <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>}
          </p>
        </div>

        <KpiGrid cols={4}>
          {summary.map((s) => (
            <KpiCard
              key={s.label}
              label={s.label}
              value={formatInrShort(s.value)}
              icon={<s.icon className={`h-3.5 w-3.5 ${s.tone}`} />}
              caption={s.caption}
            />
          ))}
        </KpiGrid>

        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Cash Flow Projection by Ageing Bucket</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={forecast}>
                <XAxis dataKey="period" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatInrShort(v)} />
                <Tooltip formatter={(v: number) => formatInrShort(v)} />
                <Legend />
                <Bar dataKey="expected" fill="hsl(226, 56%, 26%)" radius={[3, 3, 0, 0]} name="Expected" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
