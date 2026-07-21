import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Ban, FileMinus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useGlobalFilter } from "@/components/global-filter-context";
import DateRangeQuickPicker from "@/components/DateRangeQuickPicker";
import { formatInr } from "@/data/mockClaims";
import { useNavigate } from "@/lib/router-compat";
import type { Claim } from "@/data/mockClaims";

const isCancelled = (s: string) => /cancel|withdraw|void/i.test(s);
const isZeroApproved = (c: Claim) =>
  Number(c.approved_amount || 0) === 0 &&
  !!c.claim_status && !/cancel|withdraw|void/i.test(c.claim_status);

export default function ZeroCancelledRegisterPage() {
  return <AppLayout><Inner /></AppLayout>;
}

function Inner() {
  const { claims } = useLiveClaims();
  const { isWithin } = useGlobalFilter();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"zero" | "cancelled">("zero");
  const [search, setSearch] = useState("");

  const scoped = useMemo(() => claims.filter(c => isWithin(c.claim_creation_date)), [claims, isWithin]);
  const zero = useMemo(() => scoped.filter(isZeroApproved), [scoped]);
  const cancelled = useMemo(() => scoped.filter(c => isCancelled(c.claim_status || "")), [scoped]);

  const rows = tab === "zero" ? zero : cancelled;
  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.claim_number.toLowerCase().includes(q) ||
      r.patient_name.toLowerCase().includes(q) ||
      (r.tpa_name || "").toLowerCase().includes(q) ||
      (r.insurance_company_name || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const zeroValue = useMemo(() => zero.reduce((s, c) => s + Number(c.claimed_amount || 0), 0), [zero]);
  const cancelledValue = useMemo(() => cancelled.reduce((s, c) => s + Number(c.claimed_amount || 0), 0), [cancelled]);

  function exportCsv() {
    const header = "Claim,Patient,Payer,Status,Claimed,Approved,Discharge,Reason\n";
    const body = filtered.map(c => [
      c.claim_number, c.patient_name,
      c.insurance_company_name || c.tpa_name || "",
      c.claim_status || "",
      c.claimed_amount || 0, c.approved_amount || 0,
      c.date_of_discharge || "",
      (c.insurer_comments || c.remarks || "").replace(/\n/g, " "),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${tab}-register.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileMinus className="h-6 w-6" />
            Zero & Cancelled Register
          </h1>
          <p className="text-sm text-muted-foreground">
            Audit trail of ₹0 approvals and cancelled/withdrawn claims — excluded from KPIs but needed for reviews.
          </p>
        </div>
        <DateRangeQuickPicker />
      </div>

      <KpiGrid>
        <KpiCard label="₹0 approved claims" value={zero.length.toLocaleString("en-IN")} icon={<Ban className="h-4 w-4" />} tone="denial" caption={`${formatInr(zeroValue)} originally claimed`} />
        <KpiCard label="Cancelled / withdrawn" value={cancelled.length.toLocaleString("en-IN")} icon={<FileMinus className="h-4 w-4" />} caption={`${formatInr(cancelledValue)} originally claimed`} />
        <KpiCard label="Total in window" value={scoped.length.toLocaleString("en-IN")} caption="Claims within date filter" />
        <KpiCard label="Combined leakage risk" value={formatInr(zeroValue + cancelledValue)} caption="Claimed value of unproductive claims" />
      </KpiGrid>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-sm">Register</CardTitle>
          <div className="flex items-center gap-2">
            <Input placeholder="Search claim / patient / payer" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-64" />
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5"><Download className="h-3.5 w-3.5" />CSV</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "zero" | "cancelled")}>
            <TabsList>
              <TabsTrigger value="zero">Zero approved ({zero.length})</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled ({cancelled.length})</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-3">
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No claims in this bucket.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim</TableHead>
                        <TableHead>Patient</TableHead>
                        <TableHead>Payer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Claimed</TableHead>
                        <TableHead className="text-right">Approved</TableHead>
                        <TableHead>Discharge</TableHead>
                        <TableHead>Reason / Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.slice(0, 200).map(c => (
                        <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/claims?claim=${encodeURIComponent(c.claim_number)}`)}>
                          <TableCell className="font-mono text-xs">{c.claim_number}</TableCell>
                          <TableCell className="text-xs">{c.patient_name}</TableCell>
                          <TableCell className="text-xs">{c.insurance_company_name || c.tpa_name}</TableCell>
                          <TableCell className="text-xs">{c.claim_status}</TableCell>
                          <TableCell className="text-right text-xs">{formatInr(c.claimed_amount || 0)}</TableCell>
                          <TableCell className="text-right text-xs">{formatInr(c.approved_amount || 0)}</TableCell>
                          <TableCell className="text-xs">{c.date_of_discharge || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">{c.insurer_comments || c.remarks || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filtered.length > 200 && (
                    <div className="p-2 text-center text-[11px] text-muted-foreground">Showing first 200 of {filtered.length}.</div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
