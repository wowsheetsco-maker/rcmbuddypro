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
import { Plus, Clock, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";

interface GovScheme { id: string; code: string; name: string; tat_preauth_hrs: number }
interface PreAuthRow {
  id: string;
  beneficiary_name: string;
  beneficiary_id: string | null;
  pre_auth_no: string | null;
  scheme_id: string;
  scheme_code?: string;
  package_code: string | null;
  package_name: string | null;
  claimed_amount: number;
  claim_status: string;
  pre_auth_requested_at: string | null;
  pre_auth_tat_deadline: string | null;
}

function tatBadge(deadline: string | null): { label: string; tone: "red" | "amber" | "green" | "muted" } {
  if (!deadline) return { label: "—", tone: "muted" };
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return { label: "Breached", tone: "red" };
  const hrs = ms / 3_600_000;
  if (hrs < 1) return { label: `${Math.round(ms / 60_000)}m left`, tone: "red" };
  if (hrs < 3) return { label: `${hrs.toFixed(1)}h left`, tone: "amber" };
  return { label: `${hrs.toFixed(1)}h left`, tone: "green" };
}

const toneClass: Record<string, string> = {
  red: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  amber: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  green: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  muted: "bg-muted text-muted-foreground",
};

export default function GovPreAuthPage() {
  const [rows, setRows] = useState<PreAuthRow[]>([]);
  const [schemes, setSchemes] = useState<GovScheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    const [c, s] = await Promise.all([
      supabase
        .from("gov_claims")
        .select("id,beneficiary_name,beneficiary_id,pre_auth_no,scheme_id,package_code,package_name,claimed_amount,claim_status,pre_auth_requested_at,pre_auth_tat_deadline")
        .in("claim_status", ["preauth_pending", "preauth_approved", "preauth_rejected"])
        .order("pre_auth_tat_deadline", { ascending: true, nullsFirst: false }),
      supabase.from("gov_schemes").select("id,code,name,tat_preauth_hrs").eq("is_active", true),
    ]);
    setSchemes((s.data ?? []) as GovScheme[]);
    const byId = new Map((s.data ?? []).map((x) => [x.id, x.code]));
    setRows(((c.data ?? []) as PreAuthRow[]).map((r) => ({ ...r, scheme_code: byId.get(r.scheme_id) ?? "—" })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const breach = rows.filter((r) => r.pre_auth_tat_deadline && new Date(r.pre_auth_tat_deadline).getTime() < Date.now()).length;
    const pending = rows.filter((r) => r.claim_status === "preauth_pending").length;
    return { breach, pending, total: rows.length };
  }, [rows]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Pre-auth Tracker</h1>
            <p className="text-sm text-muted-foreground">Government scheme pre-authorisation queue with TAT countdown.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> New Pre-auth</Button>
            </DialogTrigger>
            <PreAuthDialogContent schemes={schemes} onSaved={() => { setOpen(false); load(); }} />
          </Dialog>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Total pending</div><div className="text-2xl font-semibold">{stats.total}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Pre-auth pending</div><div className="text-2xl font-semibold">{stats.pending}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-rose-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />TAT breached</div><div className="text-2xl font-semibold text-rose-600">{stats.breach}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Queue</CardTitle></CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              rows.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No pre-auth requests yet. Click "New Pre-auth" to add one.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Beneficiary</TableHead>
                      <TableHead>Scheme</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>TAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const t = tatBadge(r.pre_auth_tat_deadline);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium">{r.beneficiary_name}</div>
                            <div className="text-xs text-muted-foreground">{r.beneficiary_id ?? "—"}</div>
                          </TableCell>
                          <TableCell>{r.scheme_code}</TableCell>
                          <TableCell>
                            <div className="text-sm">{r.package_code ?? "—"}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[160px]">{r.package_name ?? ""}</div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">₹{Number(r.claimed_amount).toLocaleString("en-IN")}</TableCell>
                          <TableCell><Badge variant="outline">{r.claim_status.replace(/_/g, " ")}</Badge></TableCell>
                          <TableCell><span className={`text-xs px-2 py-1 rounded-full border ${toneClass[t.tone]}`}>{t.label}</span></TableCell>
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

function PreAuthDialogContent({ schemes, onSaved }: { schemes: GovScheme[]; onSaved: () => void }) {
  const [form, setForm] = useState({
    beneficiary_name: "", beneficiary_id: "", scheme_id: "", package_code: "", package_name: "", claimed_amount: "", pre_auth_no: "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.beneficiary_name || !form.scheme_id) {
      toast({ title: "Beneficiary and scheme are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const scheme = schemes.find((s) => s.id === form.scheme_id);
    const now = new Date();
    const deadline = new Date(now.getTime() + (scheme?.tat_preauth_hrs ?? 24) * 3_600_000);
    try {
      const { error } = await supabase.from("gov_claims").insert({
        org_id: getCurrentOrgId(),
        beneficiary_name: form.beneficiary_name,
        beneficiary_id: form.beneficiary_id || null,
        scheme_id: form.scheme_id,
        package_code: form.package_code || null,
        package_name: form.package_name || null,
        claimed_amount: Number(form.claimed_amount) || 0,
        pre_auth_no: form.pre_auth_no || null,
        claim_status: "preauth_pending",
        pre_auth_requested_at: now.toISOString(),
        pre_auth_tat_deadline: deadline.toISOString(),
      });
      if (error) throw error;
      toast({ title: "Pre-auth created" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Failed to create", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Pre-authorisation</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Beneficiary name *</Label><Input value={form.beneficiary_name} onChange={(e) => setForm({ ...form, beneficiary_name: e.target.value })} /></div>
          <div><Label>Beneficiary ID</Label><Input value={form.beneficiary_id} onChange={(e) => setForm({ ...form, beneficiary_id: e.target.value })} placeholder="PMJAY / e-card" /></div>
        </div>
        <div>
          <Label>Scheme *</Label>
          <Select value={form.scheme_id} onValueChange={(v) => setForm({ ...form, scheme_id: v })}>
            <SelectTrigger><SelectValue placeholder={schemes.length ? "Select scheme" : "No schemes — add via Packages page"} /></SelectTrigger>
            <SelectContent>{schemes.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Package code</Label><Input value={form.package_code} onChange={(e) => setForm({ ...form, package_code: e.target.value })} /></div>
          <div><Label>Package name</Label><Input value={form.package_name} onChange={(e) => setForm({ ...form, package_name: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Claimed amount (₹)</Label><Input type="number" value={form.claimed_amount} onChange={(e) => setForm({ ...form, claimed_amount: e.target.value })} /></div>
          <div><Label>Pre-auth no.</Label><Input value={form.pre_auth_no} onChange={(e) => setForm({ ...form, pre_auth_no: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Create"}</Button></DialogFooter>
    </DialogContent>
  );
}
