import { useMemo, useState } from "react";
import { Loader2, FileClock, Send, Search, X as XIcon, Download } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { formatInr, type Claim } from "@/data/mockClaims";
import { isDocsToSubmit } from "@/lib/claimStatusBuckets";
import { exportClaimsCsv } from "@/lib/claimsCsv";
import ClaimDrawer from "@/components/ClaimDrawer";
import { cn } from "@/lib/utils";

function daysSince(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function agingBand(days: number): { label: string; cls: string } {
  if (days >= 15) return { label: `${days}d · overdue`, cls: "bg-destructive/10 text-destructive border-destructive/30" };
  if (days >= 7) return { label: `${days}d · SLA risk`, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" };
  return { label: `${days}d`, cls: "bg-muted text-muted-foreground border-border" };
}

export default function DocsToSubmitPage() {
  const { claims, loading, isMock } = useLiveClaims();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Claim | null>(null);

  const rows = useMemo(() => {
    const filtered = claims.filter(isDocsToSubmit);
    const withAge = filtered.map((c) => ({
      claim: c,
      days: daysSince(c.date_of_discharge),
      amount: c.approved_amount || c.claimed_amount || 0,
    }));
    const needle = search.trim().toLowerCase();
    const s = needle
      ? withAge.filter(({ claim: c }) =>
          [c.claim_number, c.patient_name, c.tpa_name, c.insurance_company_name]
            .some((v) => (v || "").toLowerCase().includes(needle)),
        )
      : withAge;
    return s.sort((a, b) => b.days - a.days);
  }, [claims, search]);

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const overdue = rows.filter((r) => r.days >= 15);
  const slaRisk = rows.filter((r) => r.days >= 7 && r.days < 15);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground">Docs to be Submitted</h1>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              Approved &amp; discharged claims whose documents haven't reached the payer yet · {rows.length} pending
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {isMock && !loading && <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={rows.length === 0}
            onClick={() => exportClaimsCsv(rows.map((r) => r.claim), "docs-to-submit")}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>

        <KpiGrid cols={4}>
          <KpiCard
            label="Pending submissions"
            value={rows.length}
            loading={loading}
            empty={!loading && rows.length === 0}
            icon={<FileClock className="h-3.5 w-3.5 text-primary" />}
          />
          <KpiCard
            label="Approved value"
            value={formatInr(totalAmount)}
            loading={loading}
            empty={!loading && totalAmount === 0}
            icon={<Send className="h-3.5 w-3.5 text-success" />}
          />
          <KpiCard
            label="SLA risk (7–14d)"
            value={slaRisk.length}
            loading={loading}
            empty={!loading && slaRisk.length === 0}
            icon={<FileClock className="h-3.5 w-3.5 text-warning" />}
          />
          <KpiCard
            label="Overdue (≥15d)"
            value={overdue.length}
            tone="denial"
            loading={loading}
            empty={!loading && overdue.length === 0}
            icon={<FileClock className="h-3.5 w-3.5 text-destructive" />}
          />
        </KpiGrid>

        <div className="relative max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search claim no, patient, TPA…"
            className="h-8 pl-7 pr-7 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label="Clear search"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Card className="shadow-sm">
          <Table dense wrapperClassName="max-h-[calc(100vh-360px)]">
            <TableHeader sticky>
              <TableRow>
                <TableHead>Claim No</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead priority="secondary">Payer</TableHead>
                <TableHead priority="secondary">Status</TableHead>
                <TableHead>Discharge</TableHead>
                <TableHead>Aging</TableHead>
                <TableHead align="right">Approved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ claim: c, days, amount }) => {
                const band = agingBand(days);
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                    <TableCell className="font-mono text-[11px]">{c.claim_number}</TableCell>
                    <TableCell>{c.patient_name}</TableCell>
                    <TableCell priority="secondary" className="text-muted-foreground truncate max-w-[180px]">
                      {c.tpa_name || c.insurance_company_name || "—"}
                    </TableCell>
                    <TableCell priority="secondary">
                      <Badge variant="outline" className="text-[9px] px-1 h-4">{c.claim_status}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-[11px]">{c.date_of_discharge ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("h-4 px-1 text-[10px] font-semibold", band.cls)}>
                        {band.label}
                      </Badge>
                    </TableCell>
                    <TableCell numeric className="font-semibold">{formatInr(amount)}</TableCell>
                  </TableRow>
                );
              })}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">
                    No documents pending submission — great work!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <ClaimDrawer claim={selected} open={!!selected} onOpenChange={(o) => !o && setSelected(null)} />
    </AppLayout>
  );
}
