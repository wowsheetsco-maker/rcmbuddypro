import { useEffect, useMemo, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";

interface Corporate {
  id: string; name: string; aggregator: string | null; spoc_name: string | null;
  spoc_email: string | null; spoc_phone: string | null; contract_start: string | null;
  contract_end: string | null; is_active: boolean;
}

export default function OpdCorporatesPage() {
  const [rows, setRows] = useState<Corporate[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("opd_corporates").select("*").order("name");
    setRows((data ?? []) as Corporate[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => rows.filter((r) => !search || `${r.name} ${r.aggregator ?? ""} ${r.spoc_name ?? ""}`.toLowerCase().includes(search.toLowerCase())),
    [rows, search],
  );

  /**
   * CSV import with dedupe.
   * Required column: name. Optional: aggregator, spoc_name, spoc_email, spoc_phone, contract_start, contract_end.
   * Dedup key: lower(org_id, name). Existing rows are updated, new ones inserted.
   */
  const handleCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return toast({ title: "Empty CSV", variant: "destructive" });
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const idx = (k: string) => header.indexOf(k);
    if (idx("name") < 0) return toast({ title: "CSV missing 'name' column", variant: "destructive" });
    const orgId = getCurrentOrgId();
    const split = (line: string) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const existing = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));
    let inserts = 0; let updates = 0; const errors: string[] = [];

    for (const line of lines.slice(1)) {
      const cols = split(line);
      const name = (cols[idx("name")] ?? "").trim();
      if (!name) continue;
      const payload = {
        org_id: orgId, name,
        aggregator: idx("aggregator") >= 0 ? (cols[idx("aggregator")] || null) : null,
        spoc_name: idx("spoc_name") >= 0 ? (cols[idx("spoc_name")] || null) : null,
        spoc_email: idx("spoc_email") >= 0 ? (cols[idx("spoc_email")] || null) : null,
        spoc_phone: idx("spoc_phone") >= 0 ? (cols[idx("spoc_phone")] || null) : null,
        contract_start: idx("contract_start") >= 0 ? (cols[idx("contract_start")] || null) : null,
        contract_end: idx("contract_end") >= 0 ? (cols[idx("contract_end")] || null) : null,
      };
      const dup = existing.get(name.toLowerCase());
      if (dup) {
        const { error } = await supabase.from("opd_corporates").update(payload).eq("id", dup.id);
        if (error) errors.push(`${name}: ${error.message}`); else updates++;
      } else {
        const { error } = await supabase.from("opd_corporates").insert(payload);
        if (error) errors.push(`${name}: ${error.message}`); else inserts++;
      }
    }
    toast({
      title: `Imported ${inserts} new, updated ${updates}`,
      description: errors.length ? `${errors.length} row(s) errored — first: ${errors[0]}` : undefined,
      variant: errors.length ? "destructive" : "default",
    });
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Corporates</h1>
            <p className="text-sm text-muted-foreground">Corporate tie-ups, aggregators and SPOCs for OPD/AHC/wellness billing.</p>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleCsv(e.target.files[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" /> Import CSV</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Corporate</Button></DialogTrigger>
              <CorporateDialog onSaved={() => { setOpen(false); load(); }} />
            </Dialog>
          </div>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">{filtered.length} corporate{filtered.length === 1 ? "" : "s"}</CardTitle>
            <Input className="w-64" placeholder="Search name / aggregator / SPOC" value={search} onChange={(e) => setSearch(e.target.value)} />
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No corporates yet. Click "Import CSV" or add one.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Aggregator</TableHead><TableHead>SPOC</TableHead>
                    <TableHead>Contract</TableHead><TableHead>Status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.aggregator ?? "—"}</TableCell>
                        <TableCell>
                          <div>{r.spoc_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.spoc_email ?? r.spoc_phone ?? ""}</div>
                        </TableCell>
                        <TableCell className="text-xs">{r.contract_start ?? "—"} → {r.contract_end ?? "—"}</TableCell>
                        <TableCell><Badge variant={r.is_active ? "default" : "outline"}>{r.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          CSV columns: <code>name</code> (required), <code>aggregator, spoc_name, spoc_email, spoc_phone, contract_start, contract_end</code>. Matching by lowercased name within your org — duplicates update existing rows.
        </p>
      </div>
    </AppLayout>
  );
}

function CorporateDialog({ onSaved }: { onSaved: () => void }) {
  const [f, setF] = useState({ name: "", aggregator: "", spoc_name: "", spoc_email: "", spoc_phone: "", contract_start: "", contract_end: "" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.name) return toast({ title: "Name required", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("opd_corporates").insert({
      org_id: getCurrentOrgId(), name: f.name, aggregator: f.aggregator || null,
      spoc_name: f.spoc_name || null, spoc_email: f.spoc_email || null, spoc_phone: f.spoc_phone || null,
      contract_start: f.contract_start || null, contract_end: f.contract_end || null,
    });
    setSaving(false);
    if (error) {
      const msg = /uniq_opd_corporates_org_name/.test(error.message) ? "A corporate with this name already exists." : error.message;
      return toast({ title: "Failed", description: msg, variant: "destructive" });
    }
    toast({ title: "Corporate added" }); onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Corporate</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Name *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>Aggregator</Label><Input value={f.aggregator} onChange={(e) => setF({ ...f, aggregator: e.target.value })} placeholder="MediBuddy / Plum / Loop" /></div>
        </div>
        <div><Label>SPOC name</Label><Input value={f.spoc_name} onChange={(e) => setF({ ...f, spoc_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>SPOC email</Label><Input type="email" value={f.spoc_email} onChange={(e) => setF({ ...f, spoc_email: e.target.value })} /></div>
          <div><Label>SPOC phone</Label><Input value={f.spoc_phone} onChange={(e) => setF({ ...f, spoc_phone: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Contract start</Label><Input type="date" value={f.contract_start} onChange={(e) => setF({ ...f, contract_start: e.target.value })} /></div>
          <div><Label>Contract end</Label><Input type="date" value={f.contract_end} onChange={(e) => setF({ ...f, contract_end: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
