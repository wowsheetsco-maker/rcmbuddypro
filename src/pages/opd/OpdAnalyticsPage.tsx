import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface Visit {
  id: string; visit_date: string; status: string; payable_amount: number;
  rejection_reason: string | null; corporate_id: string | null; submitted_at: string | null; settled_at: string | null;
}
interface Corporate { id: string; name: string; aggregator: string | null }
interface Employee { wallet_total: number; wallet_balance: number }

export default function OpdAnalyticsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [corps, setCorps] = useState<Corporate[]>([]);
  const [emps, setEmps] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [v, c, e] = await Promise.all([
        supabase.from("opd_visits").select("id,visit_date,status,payable_amount,rejection_reason,corporate_id,submitted_at,settled_at").limit(2000),
        supabase.from("opd_corporates").select("id,name,aggregator"),
        supabase.from("opd_employees").select("wallet_total,wallet_balance").limit(2000),
      ]);
      setVisits((v.data ?? []) as Visit[]);
      setCorps((c.data ?? []) as Corporate[]);
      setEmps((e.data ?? []) as Employee[]);
      setLoading(false);
    })();
  }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c])), [corps]);

  const aggregatorRevenue = useMemo(() => {
    const map = new Map<string, { revenue: number; count: number }>();
    visits.forEach((v) => {
      const corp = v.corporate_id ? corpMap.get(v.corporate_id) : null;
      const agg = corp?.aggregator ?? "Direct / Walk-in";
      const cur = map.get(agg) ?? { revenue: 0, count: 0 };
      cur.revenue += Number(v.payable_amount);
      cur.count += 1;
      map.set(agg, cur);
    });
    return Array.from(map.entries()).map(([k, v]) => ({ aggregator: k, ...v })).sort((a, b) => b.revenue - a.revenue);
  }, [visits, corpMap]);

  const rejectionReasons = useMemo(() => {
    const map = new Map<string, number>();
    visits.filter((v) => v.status === "rejected").forEach((v) => {
      const r = v.rejection_reason || "Unspecified";
      map.set(r, (map.get(r) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }, [visits]);

  const tatStats = useMemo(() => {
    const submitted = visits.filter((v) => v.submitted_at && v.settled_at);
    if (submitted.length === 0) return { avgDays: 0, count: 0 };
    const total = submitted.reduce((s, v) => {
      const days = (new Date(v.settled_at!).getTime() - new Date(v.submitted_at!).getTime()) / 86400000;
      return s + days;
    }, 0);
    return { avgDays: total / submitted.length, count: submitted.length };
  }, [visits]);

  const walletUtil = useMemo(() => {
    const total = emps.reduce((s, e) => s + Number(e.wallet_total), 0);
    const used = emps.reduce((s, e) => s + Math.max(Number(e.wallet_total) - Number(e.wallet_balance), 0), 0);
    return { total, used, pct: total > 0 ? (used / total) * 100 : 0 };
  }, [emps]);

  const escalations = useMemo(() => {
    // Visits submitted > 14 days ago without settlement
    const cutoff = Date.now() - 14 * 86400000;
    return visits.filter((v) => v.status === "submitted" && v.submitted_at && new Date(v.submitted_at).getTime() < cutoff);
  }, [visits]);

  if (loading) return <AppLayout><div className="text-sm text-muted-foreground py-10 text-center">Loading analytics…</div></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">OPD Analytics</h1>
          <p className="text-sm text-muted-foreground">Aggregator revenue, rejection drivers, TAT and wallet utilisation.</p>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Avg settlement TAT</div><div className="text-2xl font-semibold">{tatStats.avgDays.toFixed(1)}d</div><div className="text-xs text-muted-foreground">{tatStats.count} settled</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Wallet utilisation</div><div className="text-2xl font-semibold">{walletUtil.pct.toFixed(0)}%</div><div className="text-xs text-muted-foreground">₹{Math.round(walletUtil.used).toLocaleString("en-IN")} of ₹{Math.round(walletUtil.total).toLocaleString("en-IN")}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Rejected visits</div><div className="text-2xl font-semibold text-denial">{visits.filter((v) => v.status === "rejected").length}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Escalations (&gt;14d)</div><div className="text-2xl font-semibold text-denial">{escalations.length}</div></CardContent></Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Revenue by aggregator</CardTitle></CardHeader>
            <CardContent>
              {aggregatorRevenue.length === 0 ? <div className="text-sm text-muted-foreground py-4">No data.</div> :
                <Table>
                  <TableHeader><TableRow><TableHead>Aggregator</TableHead><TableHead className="text-right">Visits</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {aggregatorRevenue.map((r) => (
                      <TableRow key={r.aggregator}>
                        <TableCell className="font-medium">{r.aggregator}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Math.round(r.revenue).toLocaleString("en-IN")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Top rejection reasons</CardTitle></CardHeader>
            <CardContent>
              {rejectionReasons.length === 0 ? <div className="text-sm text-muted-foreground py-4">No rejections — nice.</div> :
                <Table>
                  <TableHeader><TableRow><TableHead>Reason</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rejectionReasons.map((r) => (
                      <TableRow key={r.reason}>
                        <TableCell>{r.reason}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Auto-escalation queue
              <Badge variant="destructive">{escalations.length}</Badge>
            </CardTitle>
            <div className="text-xs text-muted-foreground">Visits submitted &gt;14 days ago that are still unsettled. Action: chase aggregator SPOC.</div>
          </CardHeader>
          <CardContent>
            {escalations.length === 0 ? <div className="text-sm text-muted-foreground py-4">No escalations.</div> :
              <Table>
                <TableHeader><TableRow><TableHead>Visit date</TableHead><TableHead>Submitted</TableHead><TableHead>Aggregator</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Days outstanding</TableHead></TableRow></TableHeader>
                <TableBody>
                  {escalations.slice(0, 50).map((v) => {
                    const corp = v.corporate_id ? corpMap.get(v.corporate_id) : null;
                    const days = Math.floor((Date.now() - new Date(v.submitted_at!).getTime()) / 86400000);
                    return (
                      <TableRow key={v.id}>
                        <TableCell className="text-xs">{v.visit_date}</TableCell>
                        <TableCell className="text-xs">{new Date(v.submitted_at!).toLocaleDateString()}</TableCell>
                        <TableCell>{corp?.aggregator ?? corp?.name ?? "Direct"}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Math.round(Number(v.payable_amount)).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right tabular-nums text-denial">{days}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            }
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
