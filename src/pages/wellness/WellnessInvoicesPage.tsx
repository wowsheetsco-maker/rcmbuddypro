import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, FileText, Mail, Sparkles, FileBarChart2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";
import { exportSingleInvoicePdf, exportSingleInvoiceXlsx, type InvoiceRow, type InvoiceLine } from "@/lib/opdInvoiceExport";
import { exportMonthlyManagementPdf } from "@/lib/wellnessMonthlyPdf";

interface Inv {
  id: string; invoice_no: string; corporate_id: string;
  period_start: string; period_end: string;
  visit_count: number; total_amount: number; paid_amount: number;
  due_date: string | null; status: string; generated_at: string;
}
interface Corp { id: string; name: string; billing_contact_email: string | null }

export default function WellnessInvoicesPage() {
  const [rows, setRows] = useState<Inv[]>([]);
  const [corps, setCorps] = useState<Corp[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [i, c] = await Promise.all([
      supabase.from("opd_invoices").select("*").order("generated_at", { ascending: false }).limit(200),
      supabase.from("opd_corporates").select("id,name,billing_contact_email").order("name"),
    ]);
    setRows((i.data ?? []) as Inv[]);
    setCorps((c.data ?? []) as Corp[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c])), [corps]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Invoices</h1>
            <p className="text-sm text-muted-foreground">Monthly invoices to wellness payors based on completed requests.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Sparkles className="h-4 w-4 mr-1" /> Generate monthly invoice</Button></DialogTrigger>
            <GenerateDialog corps={corps} onSaved={() => { setOpen(false); load(); }} />
          </Dialog>
        </header>

        <Card>
          <CardHeader><CardTitle className="text-base">Invoices ({rows.length})</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No invoices yet. Generate one for a provider + month.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Tracking #</TableHead><TableHead>Provider</TableHead>
                    <TableHead>Period</TableHead><TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const corp = corpMap.get(r.corporate_id);
                      const invRow: InvoiceRow = {
                        invoice_no: r.invoice_no,
                        corporate_name: corp?.name ?? "—",
                        period_start: r.period_start, period_end: r.period_end,
                        visit_count: r.visit_count, total_amount: Number(r.total_amount),
                        paid_amount: Number(r.paid_amount), due_date: r.due_date, status: r.status,
                        generated_at: r.generated_at,
                      };
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.invoice_no}</TableCell>
                          <TableCell>{corp?.name ?? "—"}</TableCell>
                          <TableCell className="text-xs">{r.period_start} → {r.period_end}</TableCell>
                          <TableCell className="text-right">{r.visit_count}</TableCell>
                          <TableCell className="text-right tabular-nums">₹{Math.round(Number(r.total_amount)).toLocaleString("en-IN")}</TableCell>
                          <TableCell><Badge variant={r.status === "paid" ? "default" : "outline"}>{r.status}</Badge></TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" className="h-7" onClick={async () => {
                              const { data } = await supabase.from("opd_invoice_items").select("*").eq("invoice_id", r.id);
                              exportSingleInvoiceXlsx(invRow, (data ?? []) as InvoiceLine[]);
                            }}><FileSpreadsheet className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-7" onClick={async () => {
                              const { data } = await supabase.from("opd_invoice_items").select("*").eq("invoice_id", r.id);
                              exportSingleInvoicePdf(invRow, (data ?? []) as InvoiceLine[]);
                            }}><FileText className="h-3 w-3" /></Button>
                            {corp?.billing_contact_email && (
                              <a href={`mailto:${corp.billing_contact_email}?subject=${encodeURIComponent(`Invoice ${r.invoice_no} - ${corp.name}`)}&body=${encodeURIComponent(`Please find attached invoice ${r.invoice_no} for ${r.period_start} to ${r.period_end}. Total: ₹${Math.round(Number(r.total_amount)).toLocaleString("en-IN")}.`)}`}>
                                <Button size="sm" variant="ghost" className="h-7"><Mail className="h-3 w-3" /></Button>
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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

function GenerateDialog({ corps, onSaved }: { corps: Corp[]; onSaved: () => void }) {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [f, setF] = useState({ corporate_id: "", month: defaultMonth });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!f.corporate_id) return toast({ title: "Select a provider", variant: "destructive" });
    setBusy(true);
    const [y, m] = f.month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const periodStart = start.toISOString().slice(0, 10);
    const periodEnd = end.toISOString().slice(0, 10);

    // Fetch completed requests in period for this provider
    const { data: reqs, error: reqErr } = await supabase
      .from("wellness_requests")
      .select("id, client_name, scheduled_at, requested_at, status, package_id, service_type")
      .eq("corporate_id", f.corporate_id)
      .eq("status", "completed")
      .gte("requested_at", `${periodStart}T00:00:00Z`)
      .lte("requested_at", `${periodEnd}T23:59:59Z`);
    if (reqErr) { setBusy(false); return toast({ title: "Query failed", description: reqErr.message, variant: "destructive" }); }

    const items = reqs ?? [];
    if (items.length === 0) { setBusy(false); return toast({ title: "No completed requests in this period" }); }

    const pkgIds = Array.from(new Set(items.map((r: any) => r.package_id).filter(Boolean)));
    const { data: pkgsData } = pkgIds.length
      ? await supabase.from("wellness_packages").select("id,name,price").in("id", pkgIds)
      : { data: [] as any[] };
    const pkgMap = new Map((pkgsData ?? []).map((p: any) => [p.id, p]));

    const invoiceNo = `WI-${f.month.replace("-", "")}-${Date.now().toString().slice(-5)}`;
    const total = items.reduce((s, r: any) => s + Number(pkgMap.get(r.package_id)?.price ?? 0), 0);

    const orgId = getCurrentOrgId();
    const { data: inv, error: invErr } = await supabase.from("opd_invoices").insert({
      org_id: orgId, corporate_id: f.corporate_id, invoice_no: invoiceNo,
      period_start: periodStart, period_end: periodEnd,
      visit_count: items.length, total_amount: total, paid_amount: 0, status: "draft",
    }).select("id").single();
    if (invErr || !inv) { setBusy(false); return toast({ title: "Invoice failed", description: invErr?.message, variant: "destructive" }); }

    if (items.length > 0) {
      await supabase.from("opd_invoice_items").insert(items.map((r: any) => ({
        org_id: orgId, invoice_id: inv.id,
        visit_date: (r.scheduled_at ?? r.requested_at)?.slice(0, 10),
        patient_name: r.client_name,
        description: pkgMap.get(r.package_id)?.name ?? r.service_type ?? "Service",
        amount: Number(pkgMap.get(r.package_id)?.price ?? 0),
      })) as any);
    }

    setBusy(false);
    toast({ title: `Invoice ${invoiceNo} generated`, description: `${items.length} item(s), ₹${Math.round(total).toLocaleString("en-IN")}` });
    onSaved();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Generate monthly invoice</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Provider</Label>
          <Select value={f.corporate_id} onValueChange={(v) => setF({ ...f, corporate_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Month</Label><Input type="month" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} /></div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={busy}>{busy ? "Generating…" : "Generate"}</Button></DialogFooter>
    </DialogContent>
  );
}
