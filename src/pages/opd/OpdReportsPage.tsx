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
import { Plus, FileSpreadsheet, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";
import { exportReportsXlsx, exportReportsPdf, type ReportRow, type SlaMetrics } from "@/lib/opdReportsExport";

const STAGES = ["awaiting_provider", "received", "qc", "sent_employee", "sent_corporate", "closed"] as const;
type Stage = typeof STAGES[number];

const STAGE_LABEL: Record<Stage, string> = {
  awaiting_provider: "Awaiting provider",
  received: "Received",
  qc: "QC review",
  sent_employee: "Sent to employee",
  sent_corporate: "Sent to corporate",
  closed: "Closed",
};

const NEXT_TIMESTAMP_FIELD: Record<Stage, string | null> = {
  awaiting_provider: null,
  received: "received_at",
  qc: "qc_at",
  sent_employee: "sent_employee_at",
  sent_corporate: "sent_corporate_at",
  closed: "closed_at",
};

interface Report {
  id: string; beneficiary_name: string; stage: Stage;
  awaiting_since: string; sla_target_at: string | null;
  received_at: string | null; qc_at: string | null; sent_employee_at: string | null;
  sent_corporate_at: string | null; closed_at: string | null;
  corporate_id: string | null; file_name: string | null; notes: string | null;
}

function hoursOpen(r: Report): number {
  if (r.closed_at) return 0;
  return Math.round((Date.now() - new Date(r.awaiting_since).getTime()) / 3600000);
}
function rag(h: number): "green" | "amber" | "red" {
  if (h < 24) return "green";
  if (h <= 72) return "amber";
  return "red";
}
const RAG_BADGE: Record<"green" | "amber" | "red", string> = {
  green: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  amber: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  red:   "bg-red-500/15 text-red-700 border-red-500/30",
};

export default function OpdReportsPage() {
  const [rows, setRows] = useState<Report[]>([]);
  const [stageFilter, setStageFilter] = useState<string>("open");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("opd_reports").select("*").order("awaiting_since", { ascending: false }).limit(500);
    setRows((data ?? []) as Report[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (stageFilter === "all") return true;
    if (stageFilter === "open") return r.stage !== "closed";
    return r.stage === stageFilter;
  }), [rows, stageFilter]);

  const open24 = rows.filter((r) => r.stage !== "closed" && hoursOpen(r) > 24).length;
  const open48 = rows.filter((r) => r.stage !== "closed" && hoursOpen(r) > 48).length;
  const open72 = rows.filter((r) => r.stage !== "closed" && hoursOpen(r) > 72).length;
  const closedToday = rows.filter((r) => r.closed_at && r.closed_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  const advance = async (r: Report) => {
    const i = STAGES.indexOf(r.stage);
    if (i === STAGES.length - 1) return;
    const next = STAGES[i + 1];
    const patch: any = { stage: next };
    const ts = NEXT_TIMESTAMP_FIELD[next];
    if (ts) patch[ts] = new Date().toISOString();
    const { error } = await supabase.from("opd_reports").update(patch).eq("id", r.id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else load();
  };

  const metrics: SlaMetrics = { open_24h: open24, open_48h: open48, open_72h: open72, closed_today: closedToday, total_open: rows.filter((r) => r.stage !== "closed").length };
  const exportRows: ReportRow[] = filtered.filter((r) => r.stage !== "closed").map((r) => ({
    beneficiary_name: r.beneficiary_name,
    stage: STAGE_LABEL[r.stage],
    hours_open: hoursOpen(r),
    rag: rag(hoursOpen(r)),
    awaiting_since: r.awaiting_since,
    sla_target_at: r.sla_target_at,
    file_name: r.file_name,
    notes: r.notes,
  }));

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Report tracker</h1>
            <p className="text-sm text-muted-foreground">Awaiting → received → QC → sent to employee → sent to corporate → closed. SLA RAG: green &lt;24h · amber 24-72h · red &gt;72h.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportReportsXlsx(metrics, exportRows)}><FileSpreadsheet className="h-4 w-4 mr-1" /> Excel</Button>
            <Button variant="outline" onClick={() => exportReportsPdf(metrics, exportRows)}><FileText className="h-4 w-4 mr-1" /> PDF</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New report</Button></DialogTrigger>
              <NewReportDialog onSaved={() => { setOpen(false); load(); }} />
            </Dialog>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Open &gt;24h</div><div className="text-2xl font-semibold text-amber-600">{open24}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Open &gt;48h</div><div className="text-2xl font-semibold text-amber-700">{open48}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Open &gt;72h (RED)</div><div className="text-2xl font-semibold text-red-600">{open72}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Closed today</div><div className="text-2xl font-semibold text-emerald-600">{closedToday}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Reports ({filtered.length})</CardTitle>
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">All open</SelectItem>
                <SelectItem value="all">All (incl. closed)</SelectItem>
                {STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No reports in this view.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Beneficiary</TableHead><TableHead>Stage</TableHead><TableHead>SLA</TableHead>
                    <TableHead>Hours open</TableHead><TableHead>File</TableHead><TableHead className="text-right">Action</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const h = hoursOpen(r);
                      const sla = rag(h);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.beneficiary_name}<div className="text-xs text-muted-foreground">{r.notes ?? ""}</div></TableCell>
                          <TableCell><Badge variant="outline">{STAGE_LABEL[r.stage]}</Badge></TableCell>
                          <TableCell><Badge className={RAG_BADGE[sla]}>{sla.toUpperCase()}</Badge></TableCell>
                          <TableCell className="tabular-nums">{r.stage === "closed" ? "—" : `${h}h`}</TableCell>
                          <TableCell className="text-xs">{r.file_name ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {r.stage !== "closed" && <Button size="sm" variant="outline" onClick={() => advance(r)}>Advance →</Button>}
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

function NewReportDialog({ onSaved }: { onSaved: () => void }) {
  const [f, setF] = useState({ beneficiary_name: "", notes: "", sla_hours: "48" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.beneficiary_name) return toast({ title: "Beneficiary required", variant: "destructive" });
    setSaving(true);
    const sla = Number(f.sla_hours) || 48;
    const { error } = await supabase.from("opd_reports").insert({
      org_id: getCurrentOrgId(),
      beneficiary_name: f.beneficiary_name,
      stage: "awaiting_provider",
      awaiting_since: new Date().toISOString(),
      sla_target_at: new Date(Date.now() + sla * 3600 * 1000).toISOString(),
      notes: f.notes || null,
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Report created" });
    onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New report</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Beneficiary *</Label><Input value={f.beneficiary_name} onChange={(e) => setF({ ...f, beneficiary_name: e.target.value })} /></div>
        <div><Label>SLA (hours)</Label><Input type="number" value={f.sla_hours} onChange={(e) => setF({ ...f, sla_hours: e.target.value })} /></div>
        <div><Label>Notes</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Create"}</Button></DialogFooter>
    </DialogContent>
  );
}
