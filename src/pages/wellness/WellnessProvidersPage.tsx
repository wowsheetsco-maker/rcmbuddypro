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

interface Provider {
  id: string; name: string;
  contract_start: string | null; contract_end: string | null;
  spoc_name: string | null; spoc_email: string | null; spoc_phone: string | null;
  billing_contact_email: string | null; invoice_cycle: string; is_active: boolean;
}

export default function WellnessProvidersPage() {
  const [rows, setRows] = useState<Provider[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("opd_corporates").select("*").order("name");
    setRows((data ?? []) as Provider[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    !search || r.name.toLowerCase().includes(search.toLowerCase())
  ), [rows, search]);

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("opd_corporates").update({ is_active: !active }).eq("id", id);
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Providers &amp; Contracts</h1>
            <p className="text-sm text-muted-foreground">Wellness payors / corporate clients with contract terms and billing contacts.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New provider</Button></DialogTrigger>
            <NewProviderDialog onSaved={() => { setOpen(false); load(); }} />
          </Dialog>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Providers ({filtered.length})</CardTitle>
            <Input placeholder="Search name" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No providers yet.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Contract</TableHead>
                    <TableHead>SPOC</TableHead><TableHead>Billing email</TableHead>
                    <TableHead>Cycle</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-xs">{r.contract_start ?? "—"} → {r.contract_end ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.spoc_name ?? "—"}<div className="text-muted-foreground">{r.spoc_email ?? ""}</div></TableCell>
                        <TableCell className="text-xs">{r.billing_contact_email ?? "—"}</TableCell>
                        <TableCell className="text-xs capitalize">{r.invoice_cycle}</TableCell>
                        <TableCell><Badge variant={r.is_active ? "default" : "outline"}>{r.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => toggle(r.id, r.is_active)}>{r.is_active ? "Disable" : "Enable"}</Button></TableCell>
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

function NewProviderDialog({ onSaved }: { onSaved: () => void }) {
  const [f, setF] = useState({
    name: "", contract_start: "", contract_end: "",
    spoc_name: "", spoc_email: "", spoc_phone: "",
    billing_contact_email: "", invoice_cycle: "monthly",
  });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.name) return toast({ title: "Name required", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("opd_corporates").insert({
      org_id: getCurrentOrgId(),
      name: f.name,
      contract_start: f.contract_start || null,
      contract_end: f.contract_end || null,
      spoc_name: f.spoc_name || null,
      spoc_email: f.spoc_email || null,
      spoc_phone: f.spoc_phone || null,
      billing_contact_email: f.billing_contact_email || null,
      invoice_cycle: f.invoice_cycle,
      is_active: true,
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Provider added" });
    onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New wellness provider</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Name *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Contract start</Label><Input type="date" value={f.contract_start} onChange={(e) => setF({ ...f, contract_start: e.target.value })} /></div>
          <div><Label>Contract end</Label><Input type="date" value={f.contract_end} onChange={(e) => setF({ ...f, contract_end: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>SPOC name</Label><Input value={f.spoc_name} onChange={(e) => setF({ ...f, spoc_name: e.target.value })} /></div>
          <div><Label>SPOC phone</Label><Input value={f.spoc_phone} onChange={(e) => setF({ ...f, spoc_phone: e.target.value })} /></div>
        </div>
        <div><Label>SPOC email</Label><Input type="email" value={f.spoc_email} onChange={(e) => setF({ ...f, spoc_email: e.target.value })} /></div>
        <div><Label>Billing email (for invoices)</Label><Input type="email" value={f.billing_contact_email} onChange={(e) => setF({ ...f, billing_contact_email: e.target.value })} /></div>
        <div><Label>Invoice cycle</Label>
          <Select value={f.invoice_cycle} onValueChange={(v) => setF({ ...f, invoice_cycle: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
