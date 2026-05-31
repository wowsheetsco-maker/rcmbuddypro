import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Send, RotateCcw, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "@/lib/router-compat";

interface Corporate { id: string; name: string; aggregator: string | null }
interface Employee { id: string; corporate_id: string; employee_code: string; employee_name: string; wallet_balance: number }

const DRAFT_KEY = "opd_visit_draft_v1";

const empty = () => ({
  visit_date: new Date().toISOString().slice(0, 10),
  patient_name: "",
  patient_relation: "self",
  corporate_id: "",
  employee_id: "",
  doctor_name: "",
  department: "Consultation",
  total_amount: "",
  copay: "0",
  patient_paid: "0",
  notes: "",
});

export default function OpdVisitCapturePage() {
  const navigate = useNavigate();
  const [corps, setCorps] = useState<Corporate[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [f, setF] = useState(empty());
  const [busy, setBusy] = useState<"" | "draft" | "submit">("");
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, e] = await Promise.all([
        supabase.from("opd_corporates").select("id,name,aggregator").eq("is_active", true).order("name"),
        supabase.from("opd_employees").select("id,corporate_id,employee_code,employee_name,wallet_balance").limit(2000),
      ]);
      setCorps((c.data ?? []) as Corporate[]);
      setEmployees((e.data ?? []) as Employee[]);
    })();
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) { setF({ ...empty(), ...JSON.parse(raw) }); setHasDraft(true); }
    } catch { /* noop */ }
  }, []);

  // Auto-save draft to localStorage so the user never loses progress on mobile.
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)); setHasDraft(true); } catch { /* noop */ }
    }, 400);
    return () => clearTimeout(t);
  }, [f]);

  const corpEmployees = useMemo(
    () => employees.filter((e) => !f.corporate_id || e.corporate_id === f.corporate_id),
    [employees, f.corporate_id],
  );

  const total = Number(f.total_amount) || 0;
  const copay = Number(f.copay) || 0;
  const patientPaid = Number(f.patient_paid) || 0;
  const payable = Math.max(total - copay - patientPaid, 0);
  const selectedEmp = employees.find((e) => e.id === f.employee_id);
  const walletShort = selectedEmp && payable > Number(selectedEmp.wallet_balance);

  const persist = async (status: "draft" | "captured") => {
    if (!f.patient_name.trim()) {
      toast({ title: "Patient name is required", variant: "destructive" });
      return;
    }
    setBusy(status === "draft" ? "draft" : "submit");
    const { error } = await supabase.from("opd_visits").insert({
      org_id: getCurrentOrgId(),
      visit_date: f.visit_date,
      patient_name: f.patient_name.trim(),
      patient_relation: f.patient_relation || null,
      corporate_id: f.corporate_id || null,
      employee_id: f.employee_id || null,
      doctor_name: f.doctor_name.trim() || null,
      department: f.department.trim() || null,
      total_amount: total, copay, patient_paid: patientPaid,
      payable_amount: payable,
      status,
      services: [],
      notes: f.notes.trim() || null,
    });
    setBusy("");
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    setHasDraft(false);
    toast({ title: status === "draft" ? "Draft saved" : "Visit submitted" });
    setF(empty());
    if (status === "captured") navigate("/opd/visits");
  };

  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    setHasDraft(false);
    setF(empty());
    toast({ title: "Draft cleared" });
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-xl space-y-4 pb-28">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/opd/visits")} aria-label="Back"><ChevronLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-xl font-display leading-tight">Capture visit</h1>
            <p className="text-xs text-muted-foreground">Mobile-first quick entry. Drafts auto-save on this device.</p>
          </div>
          {hasDraft && <Badge variant="secondary" className="ml-auto">Draft restored</Badge>}
        </div>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vd">Visit date</Label>
                <Input id="vd" type="date" value={f.visit_date} onChange={(e) => setF({ ...f, visit_date: e.target.value })} />
              </div>
              <div>
                <Label>Relation</Label>
                <Select value={f.patient_relation} onValueChange={(v) => setF({ ...f, patient_relation: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["self", "spouse", "child", "parent", "other"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="pn">Patient name *</Label>
              <Input id="pn" inputMode="text" autoComplete="off" value={f.patient_name} onChange={(e) => setF({ ...f, patient_name: e.target.value })} />
            </div>

            <div>
              <Label>Corporate</Label>
              <Select value={f.corporate_id} onValueChange={(v) => setF({ ...f, corporate_id: v, employee_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Walk-in / select corporate" /></SelectTrigger>
                <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.aggregator ? ` · ${c.aggregator}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {f.corporate_id && (
              <div>
                <Label>Employee</Label>
                <Select value={f.employee_id} onValueChange={(v) => setF({ ...f, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder={corpEmployees.length ? "Select employee" : "No roster yet"} /></SelectTrigger>
                  <SelectContent>
                    {corpEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.employee_code} · {e.employee_name} · ₹{Math.round(Number(e.wallet_balance)).toLocaleString("en-IN")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Doctor</Label><Input value={f.doctor_name} onChange={(e) => setF({ ...f, doctor_name: e.target.value })} /></div>
              <div><Label>Department</Label><Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} /></div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div><Label>Total ₹</Label><Input inputMode="decimal" type="number" value={f.total_amount} onChange={(e) => setF({ ...f, total_amount: e.target.value })} /></div>
              <div><Label>Copay ₹</Label><Input inputMode="decimal" type="number" value={f.copay} onChange={(e) => setF({ ...f, copay: e.target.value })} /></div>
              <div><Label>Patient paid ₹</Label><Input inputMode="decimal" type="number" value={f.patient_paid} onChange={(e) => setF({ ...f, patient_paid: e.target.value })} /></div>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Payable to aggregator</span>
              <span className="text-lg font-semibold tabular-nums">₹{payable.toLocaleString("en-IN")}</span>
            </div>
            {walletShort && (
              <p className="text-xs text-destructive">Payable exceeds wallet balance — visit will likely be rejected.</p>
            )}

            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        {/* Sticky mobile action bar */}
        <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur p-3 flex gap-2 sm:max-w-xl sm:mx-auto sm:relative sm:border-0 sm:bg-transparent sm:p-0">
          <Button variant="outline" className="flex-1" disabled={!!busy} onClick={clearDraft}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button variant="secondary" className="flex-1" disabled={!!busy} onClick={() => persist("draft")}>
            <Save className="h-4 w-4 mr-1" /> {busy === "draft" ? "Saving…" : "Save draft"}
          </Button>
          <Button className="flex-1" disabled={!!busy} onClick={() => persist("captured")}>
            <Send className="h-4 w-4 mr-1" /> {busy === "submit" ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
