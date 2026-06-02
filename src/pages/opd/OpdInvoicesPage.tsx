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
import { Plus, FilePlus2, FileSpreadsheet, FileText, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";
import {
  exportInvoicesXlsx, exportInvoicesPdf,
  exportSingleInvoiceXlsx, exportSingleInvoicePdf,
  type InvoiceRow, type InvoiceLine,
} from "@/lib/opdInvoiceExport";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Invoice {
  id: string; invoice_no: string; corporate_id: string; period_start: string; period_end: string;
  visit_count: number; total_amount: number; paid_amount: number; due_date: string | null; status: string;
  generated_at: string; submitted_at: string | null;
}
interface Corp { id: string; name: string }

const STATUSES = ["draft", "submitted", "part_paid", "paid", "outstanding", "cancelled"];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  part_paid: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  paid: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  outstanding: "bg-red-500/15 text-red-700 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground line-through",
};

export default function OpdInvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [corps, setCorps] = useState<Corp[]>([]);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [i, c] = await Promise.all([
      supabase.from("opd_invoices").select("*").order("generated_at", { ascending: false }).limit(500),
      supabase.from("opd_corporates").select("id,name").eq("is_active", true).order("name"),
    ]);
    setRows((i.data ?? []) as Invoice[]);
    setCorps((c.data ?? []) as Corp[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c.name])), [corps]);
  const filtered = rows.filter((r) => filter === "all" || r.status === filter);

  const totalOutstanding = rows.filter((r) => ["submitted", "part_paid", "outstanding"].includes(r.status))
    .reduce((s, r) => s + (Number(r.total_amount) - Number(r.paid_amount || 0)), 0);
  const totalPaid = rows.filter((r) => r.status === "paid").reduce((s, r) => s + Number(r.total_amount), 0);

  const updateStatus = async (id: string, status: string) => {
    const patch: any = { status };
    if (status === "submitted") patch.submitted_at = new Date().toISOString();
    if (status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from("opd_invoices").update(patch).eq("id", id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Invoices</h1>
            <p className="text-sm text-muted-foreground">Bulk corporate invoicing with status pipeline and aging.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportInvoicesXlsx(toExportRows(filtered, corpMap))}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel ({filtered.length})
            </Button>
            <Button variant="outline" onClick={() => exportInvoicesPdf(toExportRows(filtered, corpMap))}>
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><FilePlus2 className="h-4 w-4 mr-1" /> Generate bulk invoice</Button></DialogTrigger>
              <GenerateBulkDialog corps={corps} onSaved={() => { setOpen(false); load(); }} />
            </Dialog>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Total invoices</div><div className="text-2xl font-semibold">{rows.length}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-2xl font-semibold text-red-600 tabular-nums">₹{Math.round(totalOutstanding).toLocaleString("en-IN")}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Collected</div><div className="text-2xl font-semibold text-emerald-600 tabular-nums">₹{Math.round(totalPaid).toLocaleString("en-IN")}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Invoices ({filtered.length})</CardTitle>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No invoices yet. Click "Generate bulk invoice" to create one.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Invoice #</TableHead><TableHead>Corporate</TableHead><TableHead>Period</TableHead>
                    <TableHead className="text-right">Visits</TableHead><TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead>
                    <TableHead className="text-right">Export</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.invoice_no}</TableCell>
                        <TableCell>{corpMap.get(r.corporate_id) ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.period_start} → {r.period_end}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.visit_count}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Number(r.total_amount).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Number(r.paid_amount).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-xs">{r.due_date ?? "—"}</TableCell>
                        <TableCell>
                          <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v)}>
                            <SelectTrigger className="w-32 h-7"><SelectValue /></SelectTrigger>
                            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                          </Select>
                          <Badge className={`mt-1 ${STATUS_BADGE[r.status] ?? ""}`} variant="outline">{r.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-7"><Download className="h-3 w-3 mr-1" />Export</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => exportOne(r, corpMap, "xlsx")}><FileSpreadsheet className="h-3 w-3 mr-2" />Excel</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => exportOne(r, corpMap, "pdf")}><FileText className="h-3 w-3 mr-2" />PDF</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
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

function GenerateBulkDialog({ corps, onSaved }: { corps: Corp[]; onSaved: () => void }) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [f, setF] = useState({
    corporate_id: "", period_start: firstOfMonth, period_end: lastOfMonth, due_days: "30",
  });
  const [preview, setPreview] = useState<{ count: number; amount: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const runPreview = async () => {
    if (!f.corporate_id) return toast({ title: "Select a corporate", variant: "destructive" });
    const { data, error } = await supabase
      .from("opd_visits")
      .select("id, payable_amount")
      .eq("corporate_id", f.corporate_id)
      .gte("visit_date", f.period_start)
      .lte("visit_date", f.period_end);
    if (error) return toast({ title: "Preview failed", description: error.message, variant: "destructive" });
    const amount = (data ?? []).reduce((s: number, r: any) => s + Number(r.payable_amount), 0);
    setPreview({ count: data?.length ?? 0, amount });
  };

  const generate = async () => {
    if (!preview || preview.count === 0) return toast({ title: "Run preview first (no visits found)", variant: "destructive" });
    setSaving(true);
    const orgId = getCurrentOrgId();
    const invoiceNo = `INV-${Date.now().toString(36).toUpperCase()}`;
    const dueDate = new Date(Date.now() + Number(f.due_days || 30) * 86400000).toISOString().slice(0, 10);
    const { data: inv, error } = await supabase.from("opd_invoices").insert({
      org_id: orgId,
      corporate_id: f.corporate_id,
      invoice_no: invoiceNo,
      period_start: f.period_start,
      period_end: f.period_end,
      visit_count: preview.count,
      gross_amount: preview.amount,
      total_amount: preview.amount,
      due_date: dueDate,
      status: "draft",
    }).select("id").single();
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: `Draft invoice ${invoiceNo} created`, description: `${preview.count} visits · ₹${Math.round(preview.amount).toLocaleString("en-IN")}` });
    onSaved();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Generate bulk invoice</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Corporate *</Label>
          <Select value={f.corporate_id} onValueChange={(v) => { setF({ ...f, corporate_id: v }); setPreview(null); }}>
            <SelectTrigger><SelectValue placeholder="Select corporate" /></SelectTrigger>
            <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Period start</Label><Input type="date" value={f.period_start} onChange={(e) => { setF({ ...f, period_start: e.target.value }); setPreview(null); }} /></div>
          <div><Label>Period end</Label><Input type="date" value={f.period_end} onChange={(e) => { setF({ ...f, period_end: e.target.value }); setPreview(null); }} /></div>
        </div>
        <div><Label>Due in (days)</Label><Input type="number" value={f.due_days} onChange={(e) => setF({ ...f, due_days: e.target.value })} /></div>
        <Button variant="outline" onClick={runPreview} className="w-full">Preview visits</Button>
        {preview && (
          <Card><CardContent className="pt-4 flex justify-between">
            <div><div className="text-xs text-muted-foreground">Visits</div><div className="text-xl font-semibold">{preview.count}</div></div>
            <div><div className="text-xs text-muted-foreground">Amount</div><div className="text-xl font-semibold tabular-nums">₹{Math.round(preview.amount).toLocaleString("en-IN")}</div></div>
          </CardContent></Card>
        )}
      </div>
      <DialogFooter><Button onClick={generate} disabled={saving || !preview}>{saving ? "Generating…" : "Create draft invoice"}</Button></DialogFooter>
    </DialogContent>
  );
}
