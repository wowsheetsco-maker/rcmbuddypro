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
import { Plus, Upload, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";
import { Link } from "@/lib/router-compat";

interface Corporate { id: string; name: string; aggregator: string | null }
interface Visit {
  id: string; visit_date: string; patient_name: string; doctor_name: string | null;
  department: string | null; total_amount: number; payable_amount: number;
  copay: number; status: string; corporate_id: string | null;
}

const STATUSES = ["captured", "submitted", "approved", "rejected", "settled"];

export default function OpdVisitsPage() {
  const [rows, setRows] = useState<Visit[]>([]);
  const [corps, setCorps] = useState<Corporate[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [v, c] = await Promise.all([
      supabase.from("opd_visits").select("*").order("visit_date", { ascending: false }).limit(500),
      supabase.from("opd_corporates").select("id,name,aggregator").eq("is_active", true).order("name"),
    ]);
    setRows((v.data ?? []) as Visit[]);
    setCorps((c.data ?? []) as Corporate[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c.name])), [corps]);
  const filtered = useMemo(() => rows.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    if (search && !`${r.patient_name} ${r.doctor_name ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [rows, search, status]);

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = rows.filter((r) => r.visit_date === today).length;
  const pendingSubmit = rows.filter((r) => r.status === "captured").length;
  const totalToday = rows.filter((r) => r.visit_date === today).reduce((s, r) => s + Number(r.payable_amount), 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">OPD Visits</h1>
            <p className="text-sm text-muted-foreground">Quick-capture register for corporate OPD, teleconsult and reimbursement visits.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link to="/opd/visits/import"><Upload className="h-4 w-4 mr-1" /> Import CSV</Link></Button>
            <Button asChild variant="outline"><Link to="/opd/visits/new"><Smartphone className="h-4 w-4 mr-1" /> Quick capture</Link></Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Visit</Button></DialogTrigger>
              <NewVisitDialog corps={corps} onSaved={() => { setOpen(false); load(); }} />
            </Dialog>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Visits today</div><div className="text-2xl font-semibold">{todayCount}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Pending submission</div><div className="text-2xl font-semibold">{pendingSubmit}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Today's revenue</div><div className="text-2xl font-semibold tabular-nums">₹{Math.round(totalToday).toLocaleString("en-IN")}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Visits ({filtered.length})</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Search patient / doctor" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No visits yet. Click "New Visit" to capture one.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Patient</TableHead><TableHead>Corporate</TableHead>
                    <TableHead>Doctor</TableHead><TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Payable</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.visit_date}</TableCell>
                        <TableCell className="font-medium">{r.patient_name}</TableCell>
                        <TableCell>{r.corporate_id ? corpMap.get(r.corporate_id) ?? "—" : "—"}</TableCell>
                        <TableCell>{r.doctor_name ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Number(r.total_amount).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Number(r.payable_amount).toLocaleString("en-IN")}</TableCell>
                        <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
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

function NewVisitDialog({ corps, onSaved }: { corps: Corporate[]; onSaved: () => void }) {
  const [f, setF] = useState({
    visit_date: new Date().toISOString().slice(0, 10), patient_name: "", corporate_id: "",
    doctor_name: "", department: "Consultation", total_amount: "", copay: "0",
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.patient_name) return toast({ title: "Patient name required", variant: "destructive" });
    setSaving(true);
    const total = Number(f.total_amount) || 0;
    const copay = Number(f.copay) || 0;
    const { error } = await supabase.from("opd_visits").insert({
      org_id: getCurrentOrgId(), visit_date: f.visit_date, patient_name: f.patient_name,
      corporate_id: f.corporate_id || null, doctor_name: f.doctor_name || null, department: f.department || null,
      total_amount: total, copay, payable_amount: Math.max(total - copay, 0), status: "captured", services: [],
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Visit captured" }); onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Capture OPD Visit</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Visit date</Label><Input type="date" value={f.visit_date} onChange={(e) => setF({ ...f, visit_date: e.target.value })} /></div>
          <div><Label>Department</Label><Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></div>
        </div>
        <div><Label>Patient *</Label><Input value={f.patient_name} onChange={(e) => setF({ ...f, patient_name: e.target.value })} /></div>
        <div><Label>Corporate</Label>
          <Select value={f.corporate_id} onValueChange={(v) => setF({ ...f, corporate_id: v })}>
            <SelectTrigger><SelectValue placeholder="Walk-in / select corporate" /></SelectTrigger>
            <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Doctor</Label><Input value={f.doctor_name} onChange={(e) => setF({ ...f, doctor_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Total (₹)</Label><Input type="number" value={f.total_amount} onChange={(e) => setF({ ...f, total_amount: e.target.value })} /></div>
          <div><Label>Copay (₹)</Label><Input type="number" value={f.copay} onChange={(e) => setF({ ...f, copay: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
