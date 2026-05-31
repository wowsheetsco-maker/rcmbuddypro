import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";

interface Visit {
  id: string; visit_date: string; patient_name: string; corporate_id: string | null;
  total_amount: number; payable_amount: number; status: string;
}
interface Corporate { id: string; name: string; aggregator: string | null }
interface Batch {
  id: string; batch_no: string; aggregator: string | null; submission_date: string | null;
  claim_count: number; total_amount: number; status: string; ack_no: string | null;
}

export default function OpdBulkSubmitPage() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [corps, setCorps] = useState<Corporate[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [corporateFilter, setCorporateFilter] = useState("all");
  const [batchNo, setBatchNo] = useState(`OPD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`);
  const [aggregator, setAggregator] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [v, c, b] = await Promise.all([
      supabase.from("opd_visits").select("id,visit_date,patient_name,corporate_id,total_amount,payable_amount,status")
        .eq("status", "captured").order("visit_date", { ascending: false }).limit(500),
      supabase.from("opd_corporates").select("id,name,aggregator").eq("is_active", true).order("name"),
      supabase.from("opd_batches").select("id,batch_no,aggregator,submission_date,claim_count,total_amount,status,ack_no")
        .order("created_at", { ascending: false }).limit(50),
    ]);
    setVisits((v.data ?? []) as Visit[]);
    setCorps((c.data ?? []) as Corporate[]);
    setBatches((b.data ?? []) as Batch[]);
  };
  useEffect(() => { load(); }, []);

  const reconcileBatch = async (batch: Batch, nextStatus: "approved" | "settled" | "rejected") => {
    const patch: any = { status: nextStatus };
    const visitPatch: any = { status: nextStatus };
    if (nextStatus === "settled") visitPatch.settled_at = new Date().toISOString();
    const { error: bErr } = await supabase.from("opd_batches").update(patch).eq("id", batch.id);
    if (bErr) return toast({ title: "Failed", description: bErr.message, variant: "destructive" });
    const { error: vErr } = await supabase.from("opd_visits").update(visitPatch).eq("batch_id", batch.id);
    if (vErr) return toast({ title: "Batch updated, visits partial", description: vErr.message, variant: "destructive" });
    toast({ title: `Batch ${batch.batch_no} → ${nextStatus}` });
    load();
  };

  const setAck = async (batch: Batch, ack: string) => {
    await supabase.from("opd_batches").update({ ack_no: ack }).eq("id", batch.id);
    load();
  };

  const filtered = useMemo(() => visits.filter((v) =>
    corporateFilter === "all" || v.corporate_id === corporateFilter
  ), [visits, corporateFilter]);

  const totals = useMemo(() => {
    const sel = filtered.filter((v) => selected.has(v.id));
    return { count: sel.length, amount: sel.reduce((s, v) => s + Number(v.payable_amount), 0) };
  }, [filtered, selected]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((v) => v.id)));
  };

  const submitBatch = async () => {
    if (selected.size === 0) return toast({ title: "Select at least one visit", variant: "destructive" });
    if (!batchNo) return toast({ title: "Batch number required", variant: "destructive" });
    setSaving(true);
    try {
      const orgId = getCurrentOrgId();
      const ids = Array.from(selected);
      const corpId = corporateFilter !== "all" ? corporateFilter : null;
      const { data: batch, error: bErr } = await supabase.from("opd_batches").insert({
        org_id: orgId, batch_no: batchNo, aggregator: aggregator || null, corporate_id: corpId,
        submission_date: new Date().toISOString().slice(0, 10), claim_count: totals.count,
        total_amount: totals.amount, status: "submitted",
      }).select("id").single();
      if (bErr) throw bErr;
      const { error: uErr } = await supabase.from("opd_visits").update({
        batch_id: batch!.id, status: "submitted", submitted_at: new Date().toISOString(),
      }).in("id", ids);
      if (uErr) throw uErr;
      toast({ title: `Batch ${batchNo} submitted (${totals.count} visits)` });
      setSelected(new Set());
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">Batch Submit</h1>
          <p className="text-sm text-muted-foreground">Bundle captured visits into a batch and submit to the aggregator.</p>
        </header>

        <Card>
          <CardHeader><CardTitle className="text-base">Batch details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Batch number</Label><Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} /></div>
            <div><Label>Aggregator</Label><Input value={aggregator} onChange={(e) => setAggregator(e.target.value)} placeholder="MediBuddy / Plum" /></div>
            <div><Label>Corporate filter</Label>
              <Select value={corporateFilter} onValueChange={(v) => { setCorporateFilter(v); setSelected(new Set()); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All corporates</SelectItem>
                  {corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Captured visits ({filtered.length})</CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {totals.count} selected · ₹{Math.round(totals.amount).toLocaleString("en-IN")}
              </span>
              <Button onClick={submitBatch} disabled={saving || totals.count === 0}>
                {saving ? "Submitting…" : "Submit Batch"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No captured visits to batch.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Date</TableHead><TableHead>Patient</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Payable</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((v) => (
                      <TableRow key={v.id} className="cursor-pointer" onClick={() => toggle(v.id)}>
                        <TableCell><Checkbox checked={selected.has(v.id)} onCheckedChange={() => toggle(v.id)} /></TableCell>
                        <TableCell>{v.visit_date}</TableCell>
                        <TableCell>{v.patient_name}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Number(v.total_amount).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Number(v.payable_amount).toLocaleString("en-IN")}</TableCell>
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
