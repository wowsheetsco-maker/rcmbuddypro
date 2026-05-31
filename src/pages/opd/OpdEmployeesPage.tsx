import { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Upload, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";

interface Corporate { id: string; name: string; aggregator: string | null }
interface Employee {
  id: string; corporate_id: string; employee_code: string; employee_name: string;
  email: string | null; phone: string | null; wallet_balance: number; wallet_total: number;
  valid_from: string | null; valid_to: string | null; eligibility_synced_at: string | null;
  family_members: Array<{ name: string; relation: string }>;
}

export default function OpdEmployeesPage() {
  const [corps, setCorps] = useState<Corporate[]>([]);
  const [rows, setRows] = useState<Employee[]>([]);
  const [corpFilter, setCorpFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const [c, e] = await Promise.all([
      supabase.from("opd_corporates").select("id,name,aggregator").eq("is_active", true).order("name"),
      supabase.from("opd_employees").select("*").order("employee_name").limit(1000),
    ]);
    setCorps((c.data ?? []) as Corporate[]);
    setRows((e.data ?? []) as Employee[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c.name])), [corps]);
  const filtered = useMemo(() => rows.filter((r) => {
    if (corpFilter !== "all" && r.corporate_id !== corpFilter) return false;
    if (search && !`${r.employee_name} ${r.employee_code} ${r.email ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [rows, corpFilter, search]);

  const totals = useMemo(() => ({
    count: filtered.length,
    walletUsed: filtered.reduce((s, r) => s + Math.max(Number(r.wallet_total) - Number(r.wallet_balance), 0), 0),
    walletTotal: filtered.reduce((s, r) => s + Number(r.wallet_total), 0),
  }), [filtered]);

  const handleCsv = async (file: File) => {
    if (corpFilter === "all") {
      toast({ title: "Select a corporate first", description: "Use the filter to pick which corporate this CSV belongs to.", variant: "destructive" });
      return;
    }
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { toast({ title: "Empty CSV", variant: "destructive" }); return; }
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);
    const codeI = idx("employee_code"); const nameI = idx("employee_name");
    if (codeI < 0 || nameI < 0) {
      toast({ title: "Missing columns", description: "CSV needs employee_code,employee_name,email,phone,wallet_total,valid_from,valid_to", variant: "destructive" });
      return;
    }
    const orgId = getCurrentOrgId();
    const records = lines.slice(1).map((line) => {
      const cols = line.split(",");
      const total = Number(cols[idx("wallet_total")] ?? "0") || 0;
      return {
        org_id: orgId, corporate_id: corpFilter,
        employee_code: (cols[codeI] || "").trim(),
        employee_name: (cols[nameI] || "").trim(),
        email: (cols[idx("email")] || "").trim() || null,
        phone: (cols[idx("phone")] || "").trim() || null,
        wallet_total: total, wallet_balance: total,
        valid_from: (cols[idx("valid_from")] || "").trim() || null,
        valid_to: (cols[idx("valid_to")] || "").trim() || null,
        family_members: [], eligibility_synced_at: new Date().toISOString(),
      };
    }).filter((r) => r.employee_code && r.employee_name);
    const { error } = await supabase.from("opd_employees").upsert(records, { onConflict: "org_id,corporate_id,employee_code" });
    if (error) toast({ title: "Import failed", description: error.message, variant: "destructive" });
    else { toast({ title: `Imported ${records.length} employees` }); load(); }
  };

  const syncEligibility = async () => {
    // Phase-5 stub: marks all in-scope employees as synced now, in lieu of aggregator API.
    if (filtered.length === 0) return;
    const ids = filtered.map((r) => r.id);
    const { error } = await supabase.from("opd_employees").update({ eligibility_synced_at: new Date().toISOString() }).in("id", ids);
    if (error) toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    else { toast({ title: `Marked ${ids.length} employees synced`, description: "Stub for aggregator eligibility API." }); load(); }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Employees</h1>
            <p className="text-sm text-muted-foreground">Corporate employee + family roster with wallet balances and aggregator eligibility.</p>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" /> Import CSV</Button>
            <Button variant="outline" onClick={syncEligibility}><RefreshCw className="h-4 w-4 mr-1" /> Sync eligibility</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Employee</Button></DialogTrigger>
              <NewEmployeeDialog corps={corps} defaultCorpId={corpFilter !== "all" ? corpFilter : ""} onSaved={() => { setOpen(false); load(); }} />
            </Dialog>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Employees</div><div className="text-2xl font-semibold">{totals.count}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Wallet used</div><div className="text-2xl font-semibold tabular-nums">₹{Math.round(totals.walletUsed).toLocaleString("en-IN")}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Wallet allocated</div><div className="text-2xl font-semibold tabular-nums">₹{Math.round(totals.walletTotal).toLocaleString("en-IN")}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Roster ({filtered.length})</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Search name / code / email" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
              <Select value={corpFilter} onValueChange={setCorpFilter}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All corporates</SelectItem>
                  {corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No employees. Import a CSV or add one manually.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Corporate</TableHead>
                    <TableHead>Family</TableHead><TableHead className="text-right">Wallet</TableHead>
                    <TableHead>Validity</TableHead><TableHead>Synced</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const used = Math.max(Number(r.wallet_total) - Number(r.wallet_balance), 0);
                      const expired = r.valid_to && new Date(r.valid_to) < new Date();
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.employee_code}</TableCell>
                          <TableCell className="font-medium">
                            {r.employee_name}
                            <div className="text-xs text-muted-foreground">{r.email ?? r.phone ?? ""}</div>
                          </TableCell>
                          <TableCell>{corpMap.get(r.corporate_id) ?? "—"}</TableCell>
                          <TableCell>{(r.family_members ?? []).length}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            ₹{Math.round(Number(r.wallet_balance)).toLocaleString("en-IN")}
                            <div className="text-xs text-muted-foreground">used ₹{Math.round(used).toLocaleString("en-IN")}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.valid_from ?? "—"} → {r.valid_to ?? "—"}
                            {expired && <Badge variant="destructive" className="ml-1">Expired</Badge>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.eligibility_synced_at ? new Date(r.eligibility_synced_at).toLocaleDateString() : "—"}</TableCell>
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

function NewEmployeeDialog({ corps, defaultCorpId, onSaved }: { corps: Corporate[]; defaultCorpId: string; onSaved: () => void }) {
  const [f, setF] = useState({
    corporate_id: defaultCorpId, employee_code: "", employee_name: "", email: "", phone: "",
    wallet_total: "0", valid_from: "", valid_to: "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.corporate_id || !f.employee_code || !f.employee_name) {
      return toast({ title: "Corporate, code and name are required", variant: "destructive" });
    }
    setSaving(true);
    const total = Number(f.wallet_total) || 0;
    const { error } = await supabase.from("opd_employees").insert({
      org_id: getCurrentOrgId(), corporate_id: f.corporate_id,
      employee_code: f.employee_code, employee_name: f.employee_name,
      email: f.email || null, phone: f.phone || null,
      wallet_total: total, wallet_balance: total,
      valid_from: f.valid_from || null, valid_to: f.valid_to || null,
      family_members: [],
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Employee added" }); onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Employee</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Corporate *</Label>
          <Select value={f.corporate_id} onValueChange={(v) => setF({ ...f, corporate_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select corporate" /></SelectTrigger>
            <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Employee code *</Label><Input value={f.employee_code} onChange={(e) => setF({ ...f, employee_code: e.target.value })} /></div>
          <div><Label>Name *</Label><Input value={f.employee_name} onChange={(e) => setF({ ...f, employee_name: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label>Wallet (₹)</Label><Input type="number" value={f.wallet_total} onChange={(e) => setF({ ...f, wallet_total: e.target.value })} /></div>
          <div><Label>Valid from</Label><Input type="date" value={f.valid_from} onChange={(e) => setF({ ...f, valid_from: e.target.value })} /></div>
          <div><Label>Valid to</Label><Input type="date" value={f.valid_to} onChange={(e) => setF({ ...f, valid_to: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
