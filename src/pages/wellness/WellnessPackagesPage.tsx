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

interface Pkg {
  id: string; corporate_id: string; name: string;
  service_type: string; price: number; description: string | null; is_active: boolean;
}
interface Corp { id: string; name: string }

export default function WellnessPackagesPage() {
  const [rows, setRows] = useState<Pkg[]>([]);
  const [corps, setCorps] = useState<Corp[]>([]);
  const [providerFilter, setProviderFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [p, c] = await Promise.all([
      supabase.from("wellness_packages").select("*").order("name"),
      supabase.from("opd_corporates").select("id,name").eq("is_active", true).order("name"),
    ]);
    setRows((p.data ?? []) as Pkg[]);
    setCorps((c.data ?? []) as Corp[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c.name])), [corps]);
  const filtered = rows.filter((r) => providerFilter === "all" || r.corporate_id === providerFilter);

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("wellness_packages").update({ is_active: !active }).eq("id", id);
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Packages</h1>
            <p className="text-sm text-muted-foreground">Per-provider catalogue of consultations and health checks.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New package</Button></DialogTrigger>
            <NewPackageDialog corps={corps} onSaved={() => { setOpen(false); load(); }} />
          </Dialog>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Packages ({filtered.length})</CardTitle>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No packages yet. Add one from the button above.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Provider</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead>
                    <TableHead className="text-right">Price</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{corpMap.get(r.corporate_id) ?? "—"}</TableCell>
                        <TableCell className="font-medium">{r.name}<div className="text-xs text-muted-foreground">{r.description ?? ""}</div></TableCell>
                        <TableCell className="text-xs capitalize">{r.service_type.replace("_", " ")}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Math.round(Number(r.price)).toLocaleString("en-IN")}</TableCell>
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

function NewPackageDialog({ corps, onSaved }: { corps: Corp[]; onSaved: () => void }) {
  const [f, setF] = useState({ corporate_id: "", name: "", service_type: "consultation", price: "0", description: "" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.name || !f.corporate_id) return toast({ title: "Provider and name required", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("wellness_packages").insert({
      org_id: getCurrentOrgId(),
      corporate_id: f.corporate_id,
      name: f.name,
      service_type: f.service_type,
      price: Number(f.price) || 0,
      description: f.description || null,
      is_active: true,
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Package added" }); onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New package</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Provider *</Label>
          <Select value={f.corporate_id} onValueChange={(v) => setF({ ...f, corporate_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Name *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Annual Health Check - Basic" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Type</Label>
            <Select value={f.service_type} onValueChange={(v) => setF({ ...f, service_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="consultation">Consultation</SelectItem>
                <SelectItem value="health_check">Health Check</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Price (₹)</Label><Input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
        </div>
        <div><Label>Description / inclusions</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="CBC, LFT, ECG…" /></div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
