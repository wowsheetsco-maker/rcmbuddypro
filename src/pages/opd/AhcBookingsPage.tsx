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
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";

interface Corporate { id: string; name: string }
interface Pkg { id: string; name: string; price: number }
interface Booking {
  id: string; beneficiary_name: string; status: string; scheduled_date: string | null;
  fulfilled_date: string | null; report_delivered_at: string | null; invoice_amount: number;
  corporate_id: string | null; package_id: string | null; notes: string | null;
}

const FUNNEL = ["booked", "scheduled", "fulfilled", "report_delivered", "invoiced", "settled"];

export default function AhcBookingsPage() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [corps, setCorps] = useState<Corporate[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [b, c, p] = await Promise.all([
      supabase.from("ahc_bookings").select("*").order("scheduled_date", { ascending: false, nullsFirst: false }).limit(500),
      supabase.from("opd_corporates").select("id,name").eq("is_active", true).order("name"),
      supabase.from("ahc_packages").select("id,name,price").eq("is_active", true).order("name"),
    ]);
    setRows((b.data ?? []) as Booking[]);
    setCorps((c.data ?? []) as Corporate[]);
    setPackages((p.data ?? []) as Pkg[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c.name])), [corps]);
  const pkgMap = useMemo(() => new Map(packages.map((p) => [p.id, p.name])), [packages]);

  const filtered = useMemo(() => rows.filter((r) => status === "all" || r.status === status), [rows, status]);

  const funnelCounts = useMemo(() => {
    const c: Record<string, number> = {};
    FUNNEL.forEach((s) => (c[s] = 0));
    rows.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const advance = async (b: Booking, next: string) => {
    const patch: any = { status: next };
    if (next === "fulfilled" && !b.fulfilled_date) patch.fulfilled_date = new Date().toISOString().slice(0, 10);
    if (next === "report_delivered" && !b.report_delivered_at) patch.report_delivered_at = new Date().toISOString();
    const { error } = await supabase.from("ahc_bookings").update(patch).eq("id", b.id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: `Moved to ${next.replace("_", " ")}` }); load(); }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">AHC Bookings</h1>
            <p className="text-sm text-muted-foreground">Booking → fulfilment → report → invoice → settlement funnel.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Booking</Button></DialogTrigger>
            <NewBookingDialog corps={corps} packages={packages} onSaved={() => { setOpen(false); load(); }} />
          </Dialog>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {FUNNEL.map((s) => (
            <Card key={s} className="cursor-pointer hover:border-primary/40" onClick={() => setStatus(s === status ? "all" : s)}>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground capitalize">{s.replace("_", " ")}</div>
                <div className="text-2xl font-semibold">{funnelCounts[s] ?? 0}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">{status === "all" ? "All bookings" : `Stage: ${status.replace("_", " ")}`} ({filtered.length})</CardTitle>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {FUNNEL.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No bookings.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Beneficiary</TableHead><TableHead>Corporate</TableHead><TableHead>Package</TableHead>
                    <TableHead>Scheduled</TableHead><TableHead className="text-right">Invoice</TableHead>
                    <TableHead>Status</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const idx = FUNNEL.indexOf(r.status);
                      const nextStage = idx >= 0 && idx < FUNNEL.length - 1 ? FUNNEL[idx + 1] : null;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.beneficiary_name}</TableCell>
                          <TableCell>{r.corporate_id ? corpMap.get(r.corporate_id) ?? "—" : "—"}</TableCell>
                          <TableCell>{r.package_id ? pkgMap.get(r.package_id) ?? "—" : "—"}</TableCell>
                          <TableCell className="text-xs">{r.scheduled_date ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">₹{Math.round(Number(r.invoice_amount)).toLocaleString("en-IN")}</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{r.status.replace("_", " ")}</Badge></TableCell>
                          <TableCell>
                            {nextStage && <Button size="sm" variant="ghost" onClick={() => advance(r, nextStage)}>→ {nextStage.replace("_", " ")}</Button>}
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

function NewBookingDialog({ corps, packages, onSaved }: { corps: Corporate[]; packages: Pkg[]; onSaved: () => void }) {
  const [f, setF] = useState({
    beneficiary_name: "", corporate_id: "", package_id: "", scheduled_date: "", invoice_amount: "0", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.beneficiary_name) return toast({ title: "Beneficiary required", variant: "destructive" });
    setSaving(true);
    const pkg = packages.find((p) => p.id === f.package_id);
    const amount = Number(f.invoice_amount) || (pkg ? Number(pkg.price) : 0);
    const { error } = await supabase.from("ahc_bookings").insert({
      org_id: getCurrentOrgId(), beneficiary_name: f.beneficiary_name,
      corporate_id: f.corporate_id || null, package_id: f.package_id || null,
      scheduled_date: f.scheduled_date || null, invoice_amount: amount,
      status: f.scheduled_date ? "scheduled" : "booked", notes: f.notes || null,
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Booking created" }); onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New AHC Booking</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Beneficiary *</Label><Input value={f.beneficiary_name} onChange={(e) => setF({ ...f, beneficiary_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Corporate</Label>
            <Select value={f.corporate_id} onValueChange={(v) => setF({ ...f, corporate_id: v })}>
              <SelectTrigger><SelectValue placeholder="Walk-in" /></SelectTrigger>
              <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Package</Label>
            <Select value={f.package_id} onValueChange={(v) => {
              const pkg = packages.find((p) => p.id === v);
              setF({ ...f, package_id: v, invoice_amount: pkg ? String(pkg.price) : f.invoice_amount });
            }}>
              <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
              <SelectContent>{packages.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Scheduled date</Label><Input type="date" value={f.scheduled_date} onChange={(e) => setF({ ...f, scheduled_date: e.target.value })} /></div>
          <div><Label>Invoice (₹)</Label><Input type="number" value={f.invoice_amount} onChange={(e) => setF({ ...f, invoice_amount: e.target.value })} /></div>
        </div>
        <div><Label>Notes</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
