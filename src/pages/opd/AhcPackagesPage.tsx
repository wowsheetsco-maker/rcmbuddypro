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
  id: string; code: string; name: string; price: number;
  age_band: string | null; gender: string | null; is_active: boolean;
  inclusions: string[];
}

export default function AhcPackagesPage() {
  const [rows, setRows] = useState<Pkg[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("ahc_packages").select("*").order("name");
    setRows((data ?? []).map((r: any) => ({ ...r, inclusions: Array.isArray(r.inclusions) ? r.inclusions : [] })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter((r) =>
    !search || `${r.name} ${r.code}`.toLowerCase().includes(search.toLowerCase())
  ), [rows, search]);

  const togglePkg = async (id: string, active: boolean) => {
    await supabase.from("ahc_packages").update({ is_active: !active }).eq("id", id);
    load();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">AHC Packages</h1>
            <p className="text-sm text-muted-foreground">Annual Health Check package master — inclusions, age/gender bands, pricing.</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New Package</Button></DialogTrigger>
            <NewPackageDialog onSaved={() => { setOpen(false); load(); }} />
          </Dialog>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Packages ({filtered.length})</CardTitle>
            <Input placeholder="Search name / code" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No packages yet.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Inclusions</TableHead>
                    <TableHead>Age / Gender</TableHead><TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs">{(r.inclusions ?? []).slice(0, 4).join(", ")}{(r.inclusions ?? []).length > 4 ? ` +${r.inclusions.length - 4}` : ""}</TableCell>
                        <TableCell className="text-xs">{r.age_band ?? "All"} · {r.gender ?? "All"}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Math.round(Number(r.price)).toLocaleString("en-IN")}</TableCell>
                        <TableCell><Badge variant={r.is_active ? "default" : "outline"}>{r.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => togglePkg(r.id, r.is_active)}>{r.is_active ? "Disable" : "Enable"}</Button></TableCell>
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

function NewPackageDialog({ onSaved }: { onSaved: () => void }) {
  const [f, setF] = useState({ code: "", name: "", price: "0", age_band: "", gender: "all", inclusions: "" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.code || !f.name) return toast({ title: "Code and name required", variant: "destructive" });
    setSaving(true);
    const inclusions = f.inclusions.split(",").map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from("ahc_packages").insert({
      org_id: getCurrentOrgId(), code: f.code, name: f.name, price: Number(f.price) || 0,
      age_band: f.age_band || null, gender: f.gender === "all" ? null : f.gender,
      inclusions, is_active: true,
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Package created" }); onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New AHC Package</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Code *</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
          <div><Label>Price (₹)</Label><Input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
        </div>
        <div><Label>Name *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Age band</Label><Input value={f.age_band} onChange={(e) => setF({ ...f, age_band: e.target.value })} placeholder="18-40 / 40+" /></div>
          <div><Label>Gender</Label>
            <Select value={f.gender} onValueChange={(v) => setF({ ...f, gender: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Inclusions (comma-separated)</Label><Input value={f.inclusions} onChange={(e) => setF({ ...f, inclusions: e.target.value })} placeholder="CBC, LFT, ECG, X-ray" /></div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
