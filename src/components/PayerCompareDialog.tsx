import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { formatInrShort } from "@/data/mockClaims";
import { GRADE_TONE, type PayerStats } from "@/lib/payerScorecard";
import type { PayerBenchmarks } from "@/lib/payerBenchmarks";

interface CompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payers: PayerStats[];
  benchmarks: PayerBenchmarks;
  onRemove: (name: string) => void;
}

export function CompareDialog({ open, onOpenChange, payers, benchmarks, onRemove }: CompareDialogProps) {
  const rows: Array<{
    label: string;
    pick: (p: PayerStats) => string | number;
    median?: string | number;
    /** higher value better? */
    higherBetter?: boolean;
    raw: (p: PayerStats) => number;
  }> = [
    { label: "Claims",       pick: (p) => p.claims.toLocaleString("en-IN"),       median: benchmarks.median.claims, higherBetter: true,  raw: (p) => p.claims },
    { label: "Unique Pts",   pick: (p) => p.uniquePatients,                       median: benchmarks.median.uniquePatients, higherBetter: true, raw: (p) => p.uniquePatients },
    { label: "Outstanding",  pick: (p) => formatInrShort(p.outstanding),          higherBetter: false, raw: (p) => p.outstanding },
    { label: "Approved",     pick: (p) => formatInrShort(p.approved),             higherBetter: true, raw: (p) => p.approved },
    { label: "Settled",      pick: (p) => formatInrShort(p.settled),              higherBetter: true, raw: (p) => p.settled },
    { label: "Net Real %",   pick: (p) => `${p.netRealPct}%`,                     median: `${benchmarks.median.netRealPct}%`, higherBetter: true, raw: (p) => p.netRealPct },
    { label: "Approval %",   pick: (p) => `${p.approvalPct}%`,                    median: `${benchmarks.median.approvalPct}%`, higherBetter: true, raw: (p) => p.approvalPct },
    { label: "Avg TAT",      pick: (p) => p.avgTat > 0 ? `${p.avgTat}d` : "—",   median: `${benchmarks.median.avgTat}d`, higherBetter: false, raw: (p) => p.avgTat || 999 },
    { label: "Disc %",       pick: (p) => `${p.discPct}%`,                        median: `${benchmarks.median.discPct}%`, higherBetter: false, raw: (p) => p.discPct },
    { label: "SLA Breach", pick: (p) => p.irdaiBreach,                          higherBetter: false, raw: (p) => p.irdaiBreach },
    { label: "Score",        pick: (p) => `${p.score}/100`,                       median: `${benchmarks.median.score}`, higherBetter: true, raw: (p) => p.score },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Side-by-side comparison</DialogTitle>
          <DialogDescription>
            Best value per row is highlighted. Median column shows the portfolio benchmark.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Metric
                </th>
                {payers.map((p) => (
                  <th key={p.name} className="text-right py-2 px-3 align-bottom min-w-[10rem]">
                    <div className="flex items-start justify-end gap-1.5">
                      <div className="text-right">
                        <div className="text-xs font-semibold text-foreground truncate max-w-[10rem]">
                          {p.name}
                        </div>
                        <span className={`inline-block mt-0.5 text-[10px] px-1.5 rounded border ${GRADE_TONE[p.grade]}`}>
                          {p.grade}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 -mt-1 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(p.name)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </th>
                ))}
                <th className="text-right py-2 px-3 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold border-l bg-muted/40 min-w-[6rem]">
                  Median
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                // Find best raw value across the picked payers for highlighting
                const rawValues = payers.map((p) => r.raw(p));
                const bestRaw = r.higherBetter !== undefined
                  ? r.higherBetter ? Math.max(...rawValues) : Math.min(...rawValues)
                  : null;
                return (
                  <tr key={r.label} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-2 text-xs text-muted-foreground">{r.label}</td>
                    {payers.map((p, i) => {
                      const isBest = bestRaw !== null && rawValues[i] === bestRaw && payers.length > 1;
                      return (
                        <td
                          key={p.name}
                          className={`py-2 px-3 text-right tabular-nums text-sm ${
                            isBest ? "font-semibold text-success" : ""
                          }`}
                        >
                          {r.pick(p)}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-right tabular-nums text-xs text-muted-foreground bg-muted/20 border-l">
                      {r.median ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 border-t">
          <p className="text-[10.5px] text-muted-foreground">
            {payers.length} payer{payers.length === 1 ? "" : "s"} compared · <Badge variant="outline" className="text-[9px] py-0 ml-1">Best</Badge> highlighted in green
          </p>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
