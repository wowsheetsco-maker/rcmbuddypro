import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type SearchMode = "employee_code" | "phone" | "corporate";

interface ResultRow {
  id: string;
  employee_code: string;
  employee_name: string;
  phone: string | null;
  email: string | null;
  department: string | null;
  status: string;
  valid_from: string | null;
  valid_to: string | null;
  wallet_balance: number;
  corporate_id: string;
  corporate?: { name: string; contract_start: string | null; contract_end: string | null; dependents_allowed: boolean } | null;
}

export default function OpdEligibilityCheckPage() {
  const [mode, setMode] = useState<SearchMode>("employee_code");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const run = async () => {
    if (!query.trim()) return toast({ title: "Enter a value to search", variant: "destructive" });
    setLoading(true);
    let q = supabase
      .from("opd_employees")
      .select("id, employee_code, employee_name, phone, email, department, status, valid_from, valid_to, wallet_balance, corporate_id, opd_corporates(name, contract_start, contract_end, dependents_allowed)")
      .limit(20);
    if (mode === "employee_code") q = q.ilike("employee_code", `%${query.trim()}%`);
    if (mode === "phone") q = q.ilike("phone", `%${query.trim()}%`);
    if (mode === "corporate") q = q.ilike("opd_corporates.name", `%${query.trim()}%`);
    const { data, error } = await q;
    setLoading(false);
    if (error) return toast({ title: "Search failed", description: error.message, variant: "destructive" });
    const mapped = (data ?? []).map((r: any) => ({ ...r, corporate: r.opd_corporates })) as ResultRow[];
    setRows(mapped);
  };

  const isEligible = (r: ResultRow): { ok: boolean; reason?: string } => {
    if (r.status !== "active") return { ok: false, reason: "Employee inactive" };
    if (r.valid_to && r.valid_to < today) return { ok: false, reason: `Eligibility ended ${r.valid_to}` };
    if (r.valid_from && r.valid_from > today) return { ok: false, reason: `Eligibility starts ${r.valid_from}` };
    if (r.corporate?.contract_end && r.corporate.contract_end < today) return { ok: false, reason: "Corporate contract expired" };
    return { ok: true };
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">Eligibility Check</h1>
          <p className="text-sm text-muted-foreground">Instant ✅ / ❌ lookup by employee code, mobile number, or corporate.</p>
        </header>

        <Card>
          <CardContent className="pt-6 flex gap-2 flex-wrap items-end">
            <div className="w-44">
              <label className="text-xs text-muted-foreground">Search by</label>
              <Select value={mode} onValueChange={(v) => setMode(v as SearchMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee_code">Employee code</SelectItem>
                  <SelectItem value="phone">Mobile number</SelectItem>
                  <SelectItem value="corporate">Corporate name</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">Value</label>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="Type and press Enter" />
            </div>
            <Button onClick={run} disabled={loading}><Search className="h-4 w-4 mr-1" />{loading ? "Searching…" : "Check"}</Button>
          </CardContent>
        </Card>

        {rows && rows.length === 0 && (
          <Card><CardContent className="pt-6 text-center text-muted-foreground">No matching employees found.</CardContent></Card>
        )}

        <div className="space-y-3">
          {rows?.map((r) => {
            const e = isEligible(r);
            return (
              <Card key={r.id} className={e.ok ? "border-emerald-500/40" : "border-red-500/40"}>
                <CardHeader className="flex flex-row items-start justify-between pb-2">
                  <div>
                    <CardTitle className="text-lg">{r.employee_name}</CardTitle>
                    <div className="text-xs text-muted-foreground">{r.employee_code} · {r.corporate?.name ?? "—"}{r.department ? ` · ${r.department}` : ""}</div>
                  </div>
                  {e.ok
                    ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" /> Eligible</Badge>
                    : <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Not eligible</Badge>}
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><div className="text-xs text-muted-foreground">Mobile</div>{r.phone ?? "—"}</div>
                  <div><div className="text-xs text-muted-foreground">Email</div>{r.email ?? "—"}</div>
                  <div><div className="text-xs text-muted-foreground">Validity</div>{r.valid_from ?? "—"} → {r.valid_to ?? "—"}</div>
                  <div><div className="text-xs text-muted-foreground">Wallet</div>₹{Number(r.wallet_balance).toLocaleString("en-IN")}</div>
                  <div><div className="text-xs text-muted-foreground">Status</div><Badge variant="outline">{r.status}</Badge></div>
                  <div><div className="text-xs text-muted-foreground">Dependents allowed</div>{r.corporate?.dependents_allowed ? "Yes" : "No"}</div>
                  <div className="col-span-2"><div className="text-xs text-muted-foreground">Corporate contract</div>{r.corporate?.contract_start ?? "—"} → {r.corporate?.contract_end ?? "—"}</div>
                  {!e.ok && <div className="col-span-full text-sm text-red-600">Reason: {e.reason}</div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
