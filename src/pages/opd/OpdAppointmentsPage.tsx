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
import { Plus, CheckCircle2, BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";

const STATUSES = ["booked", "confirmed", "rescheduled", "cancelled", "completed", "no_show"];

interface Appt {
  id: string; scheduled_at: string; beneficiary_name: string; beneficiary_phone: string | null;
  provider: string | null; specialty: string | null; status: string;
  provider_confirmed_at: string | null; reminder_24h_sent_at: string | null;
  reminder_same_day_sent_at: string | null; corporate_id: string | null; notes: string | null;
}
interface Corp { id: string; name: string }

export default function OpdAppointmentsPage() {
  const [rows, setRows] = useState<Appt[]>([]);
  const [corps, setCorps] = useState<Corp[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [a, c] = await Promise.all([
      supabase.from("opd_appointments").select("*").order("scheduled_at", { ascending: false }).limit(500),
      supabase.from("opd_corporates").select("id,name").eq("is_active", true).order("name"),
    ]);
    setRows((a.data ?? []) as Appt[]);
    setCorps((c.data ?? []) as Corp[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c.name])), [corps]);
  const filtered = rows.filter((r) => statusFilter === "all" || r.status === statusFilter);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((r) => r.scheduled_at.slice(0, 10) >= today && ["booked", "confirmed"].includes(r.status)).length;
  const awaitingConfirm = rows.filter((r) => r.status === "booked" && !r.provider_confirmed_at).length;
  const completedToday = rows.filter((r) => r.scheduled_at.slice(0, 10) === today && r.status === "completed").length;

  const update = async (id: string, patch: Partial<Appt>) => {
    const { error } = await supabase.from("opd_appointments").update(patch as any).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Appointments</h1>
            <p className="text-sm text-muted-foreground">Booking lifecycle, provider confirmation, and reminders.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New appointment</Button></DialogTrigger>
            <NewApptDialog corps={corps} onSaved={() => { setOpen(false); load(); }} />
          </Dialog>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Upcoming</div><div className="text-2xl font-semibold">{upcoming}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Awaiting provider confirmation</div><div className="text-2xl font-semibold">{awaitingConfirm}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Completed today</div><div className="text-2xl font-semibold">{completedToday}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Appointments ({filtered.length})</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No appointments yet.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>When</TableHead><TableHead>Beneficiary</TableHead><TableHead>Provider</TableHead>
                    <TableHead>Corporate</TableHead><TableHead>Status</TableHead><TableHead>Provider conf.</TableHead>
                    <TableHead>Reminders</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{new Date(r.scheduled_at).toLocaleString()}</TableCell>
                        <TableCell className="font-medium">{r.beneficiary_name}<div className="text-xs text-muted-foreground">{r.beneficiary_phone ?? ""}</div></TableCell>
                        <TableCell>{r.provider ?? "—"}<div className="text-xs text-muted-foreground">{r.specialty ?? ""}</div></TableCell>
                        <TableCell>{r.corporate_id ? corpMap.get(r.corporate_id) ?? "—" : "—"}</TableCell>
                        <TableCell>
                          <Select value={r.status} onValueChange={(v) => update(r.id, { status: v })}>
                            <SelectTrigger className="w-32 h-7"><SelectValue /></SelectTrigger>
                            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {r.provider_confirmed_at
                            ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">{new Date(r.provider_confirmed_at).toLocaleDateString()}</Badge>
                            : <Button size="sm" variant="outline" className="h-7" onClick={() => update(r.id, { provider_confirmed_at: new Date().toISOString() } as any)}><CheckCircle2 className="h-3 w-3 mr-1" /> Mark</Button>}
                        </TableCell>
                        <TableCell className="text-xs space-y-1">
                          {r.reminder_24h_sent_at ? <Badge variant="outline">24h ✓</Badge> : <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => update(r.id, { reminder_24h_sent_at: new Date().toISOString() } as any)}><BellRing className="h-3 w-3 mr-1" />24h</Button>}{" "}
                          {r.reminder_same_day_sent_at ? <Badge variant="outline">Same-day ✓</Badge> : <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => update(r.id, { reminder_same_day_sent_at: new Date().toISOString() } as any)}><BellRing className="h-3 w-3 mr-1" />Same-day</Button>}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{r.notes ?? ""}</TableCell>
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

function NewApptDialog({ corps, onSaved }: { corps: Corp[]; onSaved: () => void }) {
  const [f, setF] = useState({
    scheduled_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16),
    beneficiary_name: "", beneficiary_phone: "", provider: "", specialty: "",
    corporate_id: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.beneficiary_name || !f.scheduled_at) return toast({ title: "Name and date required", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("opd_appointments").insert({
      org_id: getCurrentOrgId(),
      scheduled_at: new Date(f.scheduled_at).toISOString(),
      beneficiary_name: f.beneficiary_name,
      beneficiary_phone: f.beneficiary_phone || null,
      provider: f.provider || null,
      specialty: f.specialty || null,
      corporate_id: f.corporate_id || null,
      notes: f.notes || null,
      status: "booked",
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Appointment booked" });
    onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New appointment</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>When *</Label><Input type="datetime-local" value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Beneficiary *</Label><Input value={f.beneficiary_name} onChange={(e) => setF({ ...f, beneficiary_name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={f.beneficiary_phone} onChange={(e) => setF({ ...f, beneficiary_phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Provider</Label><Input value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} /></div>
          <div><Label>Specialty</Label><Input value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} /></div>
        </div>
        <div><Label>Corporate</Label>
          <Select value={f.corporate_id} onValueChange={(v) => setF({ ...f, corporate_id: v })}>
            <SelectTrigger><SelectValue placeholder="Walk-in / select" /></SelectTrigger>
            <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Notes</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Book"}</Button></DialogFooter>
    </DialogContent>
  );
}
