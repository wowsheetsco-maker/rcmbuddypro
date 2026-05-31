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
interface EventRow {
  id: string; event_type: string; title: string; event_date: string; location: string | null;
  planned_count: number; actual_count: number; revenue: number; expenses: number;
  status: string; corporate_id: string | null;
}
const EVENT_TYPES = ["camp", "vaccination", "executive_health", "screening", "talk"];
const STATUSES = ["planned", "in_progress", "completed", "cancelled"];

export default function WellnessEventsPage() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [corps, setCorps] = useState<Corporate[]>([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [e, c] = await Promise.all([
      supabase.from("wellness_events").select("*").order("event_date", { ascending: false }).limit(500),
      supabase.from("opd_corporates").select("id,name").eq("is_active", true).order("name"),
    ]);
    setRows((e.data ?? []) as EventRow[]);
    setCorps((c.data ?? []) as Corporate[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c.name])), [corps]);
  const filtered = useMemo(() => rows.filter((r) => status === "all" || r.status === status), [rows, status]);

  const kpis = useMemo(() => {
    const completed = rows.filter((r) => r.status === "completed");
    const rev = completed.reduce((s, r) => s + Number(r.revenue), 0);
    const exp = completed.reduce((s, r) => s + Number(r.expenses), 0);
    const reached = rows.reduce((s, r) => s + r.actual_count, 0);
    return { events: rows.length, reached, rev, exp, roi: exp > 0 ? ((rev - exp) / exp) * 100 : 0 };
  }, [rows]);

  const markCompleted = async (e: EventRow) => {
    await supabase.from("wellness_events").update({ status: "completed" }).eq("id", e.id);
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Wellness Events</h1>
            <p className="text-sm text-muted-foreground">Camps, vaccination drives and executive health programs — ROI per event.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Event</Button></DialogTrigger>
            <NewEventDialog corps={corps} onSaved={() => { setOpen(false); load(); }} />
          </Dialog>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Events</div><div className="text-2xl font-semibold">{kpis.events}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Beneficiaries reached</div><div className="text-2xl font-semibold">{kpis.reached}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Net (completed)</div><div className="text-2xl font-semibold tabular-nums">₹{Math.round(kpis.rev - kpis.exp).toLocaleString("en-IN")}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">ROI</div><div className={`text-2xl font-semibold ${kpis.roi >= 0 ? "text-success" : "text-denial"}`}>{kpis.roi.toFixed(0)}%</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Events ({filtered.length})</CardTitle>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No events yet.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Title</TableHead><TableHead>Type</TableHead>
                    <TableHead>Corporate</TableHead><TableHead className="text-right">Reach</TableHead>
                    <TableHead className="text-right">Net</TableHead><TableHead className="text-right">ROI</TableHead>
                    <TableHead>Status</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const net = Number(r.revenue) - Number(r.expenses);
                      const roi = Number(r.expenses) > 0 ? (net / Number(r.expenses)) * 100 : 0;
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{r.event_date}</TableCell>
                          <TableCell className="font-medium">{r.title}<div className="text-xs text-muted-foreground">{r.location ?? ""}</div></TableCell>
                          <TableCell className="capitalize text-xs">{r.event_type.replace("_", " ")}</TableCell>
                          <TableCell>{r.corporate_id ? corpMap.get(r.corporate_id) ?? "—" : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.actual_count} / {r.planned_count}</TableCell>
                          <TableCell className={`text-right tabular-nums ${net < 0 ? "text-denial" : ""}`}>₹{Math.round(net).toLocaleString("en-IN")}</TableCell>
                          <TableCell className={`text-right tabular-nums ${roi < 0 ? "text-denial" : "text-success"}`}>{roi.toFixed(0)}%</TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{r.status.replace("_", " ")}</Badge></TableCell>
                          <TableCell>{r.status !== "completed" && r.status !== "cancelled" && <Button size="sm" variant="ghost" onClick={() => markCompleted(r)}>Mark done</Button>}</TableCell>
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

function NewEventDialog({ corps, onSaved }: { corps: Corporate[]; onSaved: () => void }) {
  const [f, setF] = useState({
    title: "", event_type: "camp", event_date: new Date().toISOString().slice(0, 10),
    location: "", corporate_id: "", planned_count: "0", actual_count: "0", revenue: "0", expenses: "0",
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.title) return toast({ title: "Title required", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("wellness_events").insert({
      org_id: getCurrentOrgId(), title: f.title, event_type: f.event_type,
      event_date: f.event_date, location: f.location || null, corporate_id: f.corporate_id || null,
      planned_count: Number(f.planned_count) || 0, actual_count: Number(f.actual_count) || 0,
      revenue: Number(f.revenue) || 0, expenses: Number(f.expenses) || 0, status: "planned",
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Event created" }); onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Wellness Event</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Title *</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label>
            <Select value={f.event_type} onValueChange={(v) => setF({ ...f, event_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EVENT_TYPES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Date</Label><Input type="date" value={f.event_date} onChange={(e) => setF({ ...f, event_date: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Location</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
          <div><Label>Corporate</Label>
            <Select value={f.corporate_id} onValueChange={(v) => setF({ ...f, corporate_id: v })}>
              <SelectTrigger><SelectValue placeholder="(none)" /></SelectTrigger>
              <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Planned reach</Label><Input type="number" value={f.planned_count} onChange={(e) => setF({ ...f, planned_count: e.target.value })} /></div>
          <div><Label>Actual reach</Label><Input type="number" value={f.actual_count} onChange={(e) => setF({ ...f, actual_count: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Revenue (₹)</Label><Input type="number" value={f.revenue} onChange={(e) => setF({ ...f, revenue: e.target.value })} /></div>
          <div><Label>Expenses (₹)</Label><Input type="number" value={f.expenses} onChange={(e) => setF({ ...f, expenses: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
