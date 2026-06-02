import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface Visit {
  id: string; visit_date: string; status: string; payable_amount: number;
  corporate_id: string | null; employee_id: string | null; department?: string | null; services?: any;
}
interface Corp { id: string; name: string; employee_limit?: number | null }
interface Emp { id: string; corporate_id: string | null; wallet_total: number; wallet_balance: number }

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export default function OpdCorporateAnalyticsPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [corps, setCorps] = useState<Corp[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(today());
  const [corpFilter, setCorpFilter] = useState("all");

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);

  const load = async () => {
    setLoading(true);
    const [v, c, e] = await Promise.all([
      supabase.from("opd_visits").select("id,visit_date,status,payable_amount,corporate_id,employee_id,department,services")
        .gte("visit_date", from).lte("visit_date", to).limit(5000),
      supabase.from("opd_corporates").select("id,name,employee_limit"),
      supabase.from("opd_employees").select("id,corporate_id,wallet_total,wallet_balance").limit(5000),
    ]);
    setVisits((v.data ?? []) as Visit[]);
    setCorps((c.data ?? []) as Corp[]);
    setEmps((e.data ?? []) as Emp[]);
    setLoading(false);
  };

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c])), [corps]);
  const scope = useMemo(() =>
    corpFilter === "all" ? visits : visits.filter((v) => v.corporate_id === corpFilter),
    [visits, corpFilter]);

  const byCorporate = useMemo(() => {
    const map = new Map<string, { name: string; visits: number; revenue: number; uniqueEmployees: Set<string>; eligible: number }>();
    const empByCorp = new Map<string, number>();
    emps.forEach((e) => {
      if (!e.corporate_id) return;
      empByCorp.set(e.corporate_id, (empByCorp.get(e.corporate_id) ?? 0) + 1);
    });
    visits.forEach((v) => {
      const id = v.corporate_id ?? "_walkin";
      const name = v.corporate_id ? corpMap.get(v.corporate_id)?.name ?? "—" : "Walk-in / Direct";
      const cur = map.get(id) ?? { name, visits: 0, revenue: 0, uniqueEmployees: new Set<string>(), eligible: empByCorp.get(id) ?? 0 };
      cur.visits += 1;
      cur.revenue += Number(v.payable_amount);
      if (v.employee_id) cur.uniqueEmployees.add(v.employee_id);
      map.set(id, cur);
    });
    return Array.from(map.entries()).map(([id, r]) => ({
      id, name: r.name, visits: r.visits, revenue: r.revenue,
      utilized: r.uniqueEmployees.size, eligible: r.eligible,
      utilPct: r.eligible > 0 ? (r.uniqueEmployees.size / r.eligible) * 100 : 0,
      avgVisit: r.visits > 0 ? r.revenue / r.visits : 0,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [visits, corpMap, emps]);

  const byPeriod = useMemo(() => {
    const map = new Map<string, { visits: number; revenue: number }>();
    scope.forEach((v) => {
      const ym = v.visit_date.slice(0, 7);
      const cur = map.get(ym) ?? { visits: 0, revenue: 0 };
      cur.visits += 1; cur.revenue += Number(v.payable_amount);
      map.set(ym, cur);
    });
    return Array.from(map.entries()).map(([month, r]) => ({ month, ...r })).sort((a, b) => a.month.localeCompare(b.month));
  }, [scope]);

  const byService = useMemo(() => {
    const map = new Map<string, { visits: number; revenue: number }>();
    scope.forEach((v) => {
      const services: any[] = Array.isArray(v.services) ? v.services : [];
      const labels = services.length > 0
        ? services.map((s) => s?.name || s?.code || s?.type || "Service")
        : [v.department || "Consultation"];
      labels.forEach((l) => {
        const cur = map.get(l) ?? { visits: 0, revenue: 0 };
        cur.visits += 1; cur.revenue += Number(v.payable_amount) / labels.length;
        map.set(l, cur);
      });
    });
    return Array.from(map.entries()).map(([service, r]) => ({ service, ...r })).sort((a, b) => b.revenue - a.revenue).slice(0, 20);
  }, [scope]);

  const totals = {
    revenue: scope.reduce((s, v) => s + Number(v.payable_amount), 0),
    visits: scope.length,
    corporates: new Set(scope.map((v) => v.corporate_id).filter(Boolean)).size,
    employees: new Set(scope.map((v) => v.employee_id).filter(Boolean)).size,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Corporate analytics</h1>
            <p className="text-sm text-muted-foreground">Revenue and utilization by corporate, period, and service.</p>
          </div>
          <div className="flex gap-2 items-end flex-wrap">
            <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" /></div>
            <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" /></div>
            <div><Label className="text-xs">Corporate</Label>
              <Select value={corpFilter} onValueChange={setCorpFilter}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All corporates</SelectItem>
                  {corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-2xl font-semibold tabular-nums">{inr(totals.revenue)}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Visits</div><div className="text-2xl font-semibold">{totals.visits}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Active corporates</div><div className="text-2xl font-semibold">{totals.corporates}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Unique employees</div><div className="text-2xl font-semibold">{totals.employees}</div></CardContent></Card>
        </div>

        {loading ? <div className="text-sm text-muted-foreground py-10 text-center">Loading…</div> : (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue & utilization by corporate</CardTitle></CardHeader>
              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Corporate</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Avg / visit</TableHead>
                    <TableHead className="text-right">Utilized emp.</TableHead>
                    <TableHead className="text-right">Eligible</TableHead>
                    <TableHead className="text-right">Utilization %</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {byCorporate.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No visits in this range.</TableCell></TableRow> :
                      byCorporate.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                          <TableCell className="text-right tabular-nums">{inr(r.revenue)}</TableCell>
                          <TableCell className="text-right tabular-nums">{inr(r.avgVisit)}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.utilized}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.eligible || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.eligible > 0 ? `${r.utilPct.toFixed(0)}%` : "—"}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">By month {corpFilter !== "all" && `· ${corpMap.get(corpFilter)?.name ?? ""}`}</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Visits</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {byPeriod.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No data.</TableCell></TableRow> :
                        byPeriod.map((r) => (
                          <TableRow key={r.month}>
                            <TableCell>{r.month}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                            <TableCell className="text-right tabular-nums">{inr(r.revenue)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">By service / package (top 20)</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Service</TableHead><TableHead className="text-right">Visits</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {byService.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No data.</TableCell></TableRow> :
                        byService.map((r) => (
                          <TableRow key={r.service}>
                            <TableCell className="truncate max-w-[14rem]">{r.service}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                            <TableCell className="text-right tabular-nums">{inr(r.revenue)}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
