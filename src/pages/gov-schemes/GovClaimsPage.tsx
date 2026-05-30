import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

interface GovClaim {
  id: string;
  beneficiary_name: string;
  scheme_id: string;
  package_code: string | null;
  package_name: string | null;
  claim_no: string | null;
  claimed_amount: number;
  approved_amount: number;
  paid_amount: number;
  deduction_amount: number;
  claim_status: string;
  date_of_admission: string | null;
  date_of_discharge: string | null;
}

const STATUSES = [
  "preauth_pending","preauth_approved","preauth_rejected","admitted","discharged",
  "claim_submitted","query_raised","approved","rejected","paid","settled",
];

export default function GovClaimsPage() {
  const [rows, setRows] = useState<GovClaim[]>([]);
  const [schemeMap, setSchemeMap] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, s] = await Promise.all([
        supabase.from("gov_claims").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("gov_schemes").select("id,code"),
      ]);
      setSchemeMap(new Map((s.data ?? []).map((x) => [x.id, x.code])));
      setRows((c.data ?? []) as GovClaim[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => rows.filter((r) => {
    if (status !== "all" && r.claim_status !== status) return false;
    if (search && !`${r.beneficiary_name} ${r.claim_no ?? ""} ${r.package_code ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [rows, search, status]);

  const totals = useMemo(() => filtered.reduce((acc, r) => ({
    claimed: acc.claimed + Number(r.claimed_amount), approved: acc.approved + Number(r.approved_amount),
    paid: acc.paid + Number(r.paid_amount), deduction: acc.deduction + Number(r.deduction_amount),
  }), { claimed: 0, approved: 0, paid: 0, deduction: 0 }), [filtered]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">Government Claims</h1>
          <p className="text-sm text-muted-foreground">Scheme-wise claim master with package, status and deductions.</p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Claimed", v: totals.claimed },
            { l: "Approved", v: totals.approved },
            { l: "Paid", v: totals.paid },
            { l: "Deductions", v: totals.deduction, tone: "text-rose-600" },
          ].map((t) => (
            <Card key={t.l}><CardContent className="pt-4"><div className="text-xs text-muted-foreground">{t.l}</div>
              <div className={`text-xl font-semibold tabular-nums ${t.tone ?? ""}`}>₹{Math.round(t.v).toLocaleString("en-IN")}</div></CardContent></Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Claims ({filtered.length})</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Search beneficiary / claim no / package" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No claims match the filters.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Beneficiary</TableHead>
                      <TableHead>Scheme</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>Claim no</TableHead>
                      <TableHead className="text-right">Claimed</TableHead>
                      <TableHead className="text-right">Approved</TableHead>
                      <TableHead className="text-right">Deduction</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.beneficiary_name}</TableCell>
                        <TableCell>{schemeMap.get(r.scheme_id) ?? "—"}</TableCell>
                        <TableCell>{r.package_code ?? "—"}</TableCell>
                        <TableCell>{r.claim_no ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Number(r.claimed_amount).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{Number(r.approved_amount).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="text-right tabular-nums text-rose-600">₹{Number(r.deduction_amount).toLocaleString("en-IN")}</TableCell>
                        <TableCell><Badge variant="outline">{r.claim_status.replace(/_/g, " ")}</Badge></TableCell>
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
