import { Link } from "@/lib/router-compat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
import { formatInr } from "@/data/mockClaims";
import { CATEGORY_COLORS } from "@/data/denialCodes";
import { getDenialKpis, getCategoryStats, getInsurerStats } from "@/lib/denialAnalytics";
import { useLiveClaims } from "@/hooks/useLiveClaims";

/**
 * Compact denial-analytics widget for CFO + Billing dashboards.
 * Shows top 3 denial KPIs, top categories by amount at risk, and worst insurer.
 */
export default function DenialAnalyticsCard() {
  const { claims } = useLiveClaims();
  const kpis = getDenialKpis(claims);
  const categories = getCategoryStats(claims).slice(0, 3);
  const worstInsurer = getInsurerStats(claims).filter(i => i.deniedClaims > 0)[0];

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Denial Analytics
        </CardTitle>
        <Link
          to="/claims/denials"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mini KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-md border p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
              <AlertTriangle className="h-3 w-3 text-destructive" /> Denial rate
            </div>
            <div className="text-lg font-bold tabular-nums mt-1">
              {(kpis.denialRate * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-muted-foreground">{kpis.totalDenied} claims</div>
          </div>
          <div className="rounded-md border p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
              <ShieldCheck className="h-3 w-3 text-accent" /> First-pass
            </div>
            <div className="text-lg font-bold tabular-nums mt-1">
              {(kpis.firstPassRate * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-muted-foreground">No query / denial</div>
          </div>
          <div className="rounded-md border p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
              <Sparkles className="h-3 w-3 text-accent" /> Recoverable
            </div>
            <div className="text-lg font-bold tabular-nums mt-1">{formatInr(kpis.recoverable)}</div>
            <div className="text-[10px] text-muted-foreground">of {formatInr(kpis.amountAtRisk)} at risk</div>
          </div>
        </div>

        {/* Top categories */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Top denial categories
          </div>
          {categories.map(c => {
            const pct = kpis.amountAtRisk ? (c.amountAtRisk / kpis.amountAtRisk) * 100 : 0;
            return (
              <div key={c.category} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.category] }} />
                    <span>{c.category}</span>
                  </div>
                  <span className="tabular-nums font-medium">{formatInr(c.amountAtRisk)}</span>
                </div>
                <Progress value={pct} className="h-1.5" />
              </div>
            );
          })}
        </div>

        {/* Worst insurer */}
        {worstInsurer && (
          <div className="rounded-md bg-muted/40 border p-2.5 flex items-center justify-between">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Highest denial rate</div>
              <div className="text-xs font-medium mt-0.5">{worstInsurer.name}</div>
            </div>
            <Badge variant="destructive" className="text-[10px] tabular-nums">
              {(worstInsurer.denialRate * 100).toFixed(1)}%
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
