import { useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertOctagon } from "lucide-react";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useGlobalFilter } from "@/components/global-filter-context";
import DateRangeQuickPicker from "@/components/DateRangeQuickPicker";
import { detectExceptions, type ExceptionBucket } from "@/lib/executiveExceptions";
import { formatInr } from "@/data/mockClaims";
import { cn } from "@/lib/utils";
import { useNavigate } from "@/lib/router-compat";

const SEV: Record<ExceptionBucket["severity"], string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-border bg-muted text-muted-foreground",
};

export default function ExecutiveExceptionsPage() {
  return <AppLayout><Inner /></AppLayout>;
}

function Inner() {
  const { claims } = useLiveClaims();
  const { isWithin } = useGlobalFilter();
  const navigate = useNavigate();
  const scoped = useMemo(() => claims.filter(c => isWithin(c.claim_creation_date)), [claims, isWithin]);
  const buckets = useMemo(() => detectExceptions(scoped), [scoped]);
  const totalRows = buckets.reduce((s, b) => s + b.rows.length, 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertOctagon className="h-6 w-6 text-destructive" />
            Executive Exceptions
          </h1>
          <p className="text-sm text-muted-foreground">
            Things that should not exist in a well-run RCM. Fix these before reading KPIs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">Total exceptions</div>
            <div className="text-2xl font-bold text-destructive">{totalRows.toLocaleString("en-IN")}</div>
          </div>
          <DateRangeQuickPicker />
        </div>
      </div>

      <div className="grid gap-4">
        {buckets.map(b => (
          <Card key={b.id}>
            <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  {b.title}
                  <Badge variant="outline" className={cn("text-[10px]", SEV[b.severity])}>{b.severity}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{b.description}</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">{b.rows.length}</div>
                <div className="text-[11px] text-muted-foreground">exceptions</div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {b.rows.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Clean — no exceptions.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Claim</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead>Payer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Age</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {b.rows.slice(0, 25).map(r => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/claims?claim=${encodeURIComponent(r.claimNumber)}`)}>
                        <TableCell className="font-mono text-xs">{r.claimNumber}</TableCell>
                        <TableCell className="text-xs">{r.patient}</TableCell>
                        <TableCell className="text-xs">{r.payer}</TableCell>
                        <TableCell className="text-right text-xs">{formatInr(r.amount)}</TableCell>
                        <TableCell className="text-right text-xs">{r.ageDays}d</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {b.rows.length > 25 && (
                <div className="p-2 text-center text-[11px] text-muted-foreground">
                  Showing first 25 of {b.rows.length}.
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
