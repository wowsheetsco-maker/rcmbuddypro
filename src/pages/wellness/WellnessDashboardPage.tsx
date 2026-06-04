import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Row {
  provider: string;
  received: number; confirmed: number; completed: number; cancelled: number;
  revenue: number; outstanding: number;
}

export default function WellnessDashboardPage() {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [y, m] = month.split("-").map(Number);
      const start = new Date(y, m - 1, 1).toISOString();
      const end = new Date(y, m, 0, 23, 59, 59).toISOString();

      const [{ data: corps }, { data: reqs }, { data: pkgs }, { data: invs }] = await Promise.all([
        supabase.from("opd_corporates").select("id,name"),
        supabase.from("wellness_requests").select("corporate_id,status,package_id").gte("requested_at", start).lte("requested_at", end),
        supabase.from("wellness_packages").select("id,price"),
        supabase.from("opd_invoices").select("corporate_id,total_amount,paid_amount").gte("period_start", start.slice(0, 10)).lte("period_end", end.slice(0, 10)),
      ]);

      const pkgPrice = new Map((pkgs ?? []).map((p: any) => [p.id, Number(p.price)]));
      const byCorp = new Map<string, Row>();
      (corps ?? []).forEach((c: any) => byCorp.set(c.id, {
        provider: c.name, received: 0, confirmed: 0, completed: 0, cancelled: 0, revenue: 0, outstanding: 0,
      }));

      (reqs ?? []).forEach((r: any) => {
        if (!r.corporate_id) return;
        const row = byCorp.get(r.corporate_id);
        if (!row) return;
        row.received += 1;
        if (r.status === "confirmed" || r.status === "rescheduled") row.confirmed += 1;
        if (r.status === "completed") {
          row.completed += 1;
          row.revenue += pkgPrice.get(r.package_id) ?? 0;
        }
        if (r.status === "cancelled") row.cancelled += 1;
      });

      (invs ?? []).forEach((i: any) => {
        const row = byCorp.get(i.corporate_id);
        if (!row) return;
        row.outstanding += Math.max(0, Number(i.total_amount) - Number(i.paid_amount));
      });

      setRows(Array.from(byCorp.values()).filter((r) => r.received > 0 || r.outstanding > 0).sort((a, b) => b.revenue - a.revenue));
      setLoading(false);
    })();
  }, [month]);

  const totals = useMemo(() => rows.reduce((t, r) => ({
    received: t.received + r.received, confirmed: t.confirmed + r.confirmed,
    completed: t.completed + r.completed, cancelled: t.cancelled + r.cancelled,
    revenue: t.revenue + r.revenue, outstanding: t.outstanding + r.outstanding,
  }), { received: 0, confirmed: 0, completed: 0, cancelled: 0, revenue: 0, outstanding: 0 }), [rows]);

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`Wellness Management Report — ${month}`, 14, 14);
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 20);
    autoTable(doc, {
      startY: 24,
      head: [["Provider", "Received", "Confirmed", "Completed", "Cancelled", "Revenue (₹)", "Outstanding (₹)"]],
      body: rows.map((r) => [r.provider, r.received, r.confirmed, r.completed, r.cancelled,
        Math.round(r.revenue).toLocaleString("en-IN"), Math.round(r.outstanding).toLocaleString("en-IN")]),
      foot: [["Total", totals.received, totals.confirmed, totals.completed, totals.cancelled,
        Math.round(totals.revenue).toLocaleString("en-IN"), Math.round(totals.outstanding).toLocaleString("en-IN")]],
      styles: { fontSize: 9 }, headStyles: { fillColor: [30, 41, 59] }, footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
    });
    doc.save(`wellness-report-${month}.pdf`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Management Report</h1>
            <p className="text-sm text-muted-foreground">Per-provider activity and revenue for the selected month.</p>
          </div>
          <div className="flex items-end gap-2">
            <div><Label className="text-xs">Month</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" /></div>
            <Button onClick={exportPdf} disabled={rows.length === 0}><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Requests received</div><div className="text-2xl font-semibold">{totals.received}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Completed</div><div className="text-2xl font-semibold">{totals.completed}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Revenue</div><div className="text-2xl font-semibold tabular-nums">₹{Math.round(totals.revenue).toLocaleString("en-IN")}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-2xl font-semibold tabular-nums">₹{Math.round(totals.outstanding).toLocaleString("en-IN")}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Per-provider breakdown</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No activity in this month.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Confirmed</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Cancelled</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.provider}>
                        <TableCell className="font-medium">{r.provider}</TableCell>
                        <TableCell className="text-right">{r.received}</TableCell>
                        <TableCell className="text-right">{r.confirmed}</TableCell>
                        <TableCell className="text-right">{r.completed}</TableCell>
                        <TableCell className="text-right">{r.cancelled}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Math.round(r.revenue).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Math.round(r.outstanding).toLocaleString("en-IN")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
