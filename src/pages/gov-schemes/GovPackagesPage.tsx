import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";

interface Scheme { id: string; code: string; name: string }
interface Pkg {
  id: string; scheme_id: string; package_code: string; package_name: string;
  specialty: string | null; rate: number; implant_allowed: boolean; is_active: boolean;
}

export default function GovPackagesPage() {
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [search, setSearch] = useState("");
  const [schemeFilter, setSchemeFilter] = useState("all");
  const [pkgOpen, setPkgOpen] = useState(false);
  const [schemeOpen, setSchemeOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [s, p] = await Promise.all([
      supabase.from("gov_schemes").select("id,code,name").order("code"),
      supabase.from("gov_packages").select("*").order("package_code").limit(2000),
    ]);
    setSchemes((s.data ?? []) as Scheme[]);
    setPkgs((p.data ?? []) as Pkg[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => pkgs.filter((p) => {
    if (schemeFilter !== "all" && p.scheme_id !== schemeFilter) return false;
    if (search && !`${p.package_code} ${p.package_name} ${p.specialty ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [pkgs, search, schemeFilter]);

  const schemeMap = useMemo(() => new Map(schemes.map((s) => [s.id, s.code])), [schemes]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Package Rate Master</h1>
            <p className="text-sm text-muted-foreground">HBP 2.2 (PMJAY) and state-scheme package rates.</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={schemeOpen} onOpenChange={setSchemeOpen}>
              <DialogTrigger asChild><Button variant="outline"><Plus className="h-4 w-4 mr-1" /> Scheme</Button></DialogTrigger>
              <SchemeDialog onSaved={() => { setSchemeOpen(false); load(); }} />
            </Dialog>
            <Dialog open={pkgOpen} onOpenChange={setPkgOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Package</Button></DialogTrigger>
              <PackageDialog schemes={schemes} onSaved={() => { setPkgOpen(false); load(); }} />
            </Dialog>
          </div>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Packages ({filtered.length})</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Search code / name / specialty" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
              <Select value={schemeFilter} onValueChange={setSchemeFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All schemes</SelectItem>
                  {schemes.map((s) => <SelectItem key={s.id} value={s.id}>{s.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              schemes.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">Start by adding a scheme (e.g. PMJAY, CGHS), then add its packages.</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No packages yet.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Scheme</TableHead><TableHead>Code</TableHead><TableHead>Name</TableHead>
                    <TableHead>Specialty</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Implant</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{schemeMap.get(p.scheme_id) ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{p.package_code}</TableCell>
                        <TableCell>{p.package_name}</TableCell>
                        <TableCell>{p.specialty ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Number(p.rate).toLocaleString("en-IN")}</TableCell>
                        <TableCell>{p.implant_allowed ? "Yes" : "No"}</TableCell>
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

function SchemeDialog({ onSaved }: { onSaved: () => void }) {
  const [f, setF] = useState({ code: "", name: "", scheme_type: "central", tat_preauth_hrs: "24", tat_claim_days: "15" });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.code || !f.name) return toast({ title: "Code and name required", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("gov_schemes").insert({
      org_id: getCurrentOrgId(), code: f.code, name: f.name, scheme_type: f.scheme_type,
      tat_preauth_hrs: Number(f.tat_preauth_hrs) || 24, tat_claim_days: Number(f.tat_claim_days) || 15,
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Scheme added" }); onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Government Scheme</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Code *</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="PMJAY" /></div>
          <div><Label>Type</Label>
            <Select value={f.scheme_type} onValueChange={(v) => setF({ ...f, scheme_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="central">Central</SelectItem><SelectItem value="state">State</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Name *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ayushman Bharat - PMJAY" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Pre-auth TAT (hrs)</Label><Input type="number" value={f.tat_preauth_hrs} onChange={(e) => setF({ ...f, tat_preauth_hrs: e.target.value })} /></div>
          <div><Label>Claim TAT (days)</Label><Input type="number" value={f.tat_claim_days} onChange={(e) => setF({ ...f, tat_claim_days: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}

function PackageDialog({ schemes, onSaved }: { schemes: Scheme[]; onSaved: () => void }) {
  const [f, setF] = useState({ scheme_id: "", package_code: "", package_name: "", specialty: "", rate: "", implant_allowed: false });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!f.scheme_id || !f.package_code || !f.package_name) return toast({ title: "Scheme, code, and name required", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("gov_packages").insert({
      org_id: getCurrentOrgId(), scheme_id: f.scheme_id, package_code: f.package_code, package_name: f.package_name,
      specialty: f.specialty || null, rate: Number(f.rate) || 0, implant_allowed: f.implant_allowed,
    });
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Package added" }); onSaved();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Package</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Scheme *</Label>
          <Select value={f.scheme_id} onValueChange={(v) => setF({ ...f, scheme_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select scheme" /></SelectTrigger>
            <SelectContent>{schemes.map((s) => <SelectItem key={s.id} value={s.id}>{s.code}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Code *</Label><Input value={f.package_code} onChange={(e) => setF({ ...f, package_code: e.target.value })} /></div>
          <div><Label>Specialty</Label><Input value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} /></div>
        </div>
        <div><Label>Name *</Label><Input value={f.package_name} onChange={(e) => setF({ ...f, package_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Rate (₹)</Label><Input type="number" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></div>
          <div className="flex items-end gap-2">
            <input id="impl" type="checkbox" checked={f.implant_allowed} onChange={(e) => setF({ ...f, implant_allowed: e.target.checked })} />
            <Label htmlFor="impl">Implant allowed</Label>
          </div>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
