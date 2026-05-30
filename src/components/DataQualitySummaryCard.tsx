// Reusable summary card showing the 4-layer Data Quality breakdown.
// Used by Import Claims (pre-commit) and the standalone Data Quality dashboard.

import { CheckCircle2, AlertTriangle, AlertCircle, ShieldAlert, Layers, Trash2, Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DqResult, DqSummary, DqTag, StatusBucket } from "@/lib/dataQualityEngine";
import { ISSUE_CODE_LABELS, STATUS_BUCKET_LABELS } from "@/lib/dataQualityEngine";

const TAG_META: Record<
  DqTag,
  { label: string; icon: typeof CheckCircle2; cls: string; chipCls: string }
> = {
  clean: {
    label: "Clean",
    icon: CheckCircle2,
    cls: "text-accent",
    chipCls: "bg-accent text-accent-foreground",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    cls: "text-warning",
    chipCls: "bg-warning text-warning-foreground",
  },
  error: {
    label: "Error",
    icon: AlertCircle,
    cls: "text-destructive",
    chipCls: "bg-destructive text-destructive-foreground",
  },
  critical: {
    label: "Critical",
    icon: ShieldAlert,
    cls: "text-destructive",
    chipCls: "bg-destructive text-destructive-foreground border-2 border-destructive",
  },
};

interface Props {
  summary: DqSummary;
  results?: DqResult[];
  showTopIssues?: boolean;
  className?: string;
}

export default function DataQualitySummaryCard({
  summary,
  showTopIssues = true,
  className,
}: Props) {
  const tagOrder: DqTag[] = ["clean", "warning", "error", "critical"];
  const cleanPct =
    summary.total > 0 ? (summary.byTag.clean / summary.total) * 100 : 0;

  const topIssues = Object.entries(summary.byCode)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  return (
    <Card className={className}>
      <CardContent className="p-4 space-y-4">
        {/* Quality score */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Data Quality Score
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {cleanPct.toFixed(1)}%
              <span className="text-xs text-muted-foreground font-normal ml-1.5">
                clean
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Rows scored
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {summary.total.toLocaleString("en-IN")}
            </div>
          </div>
        </div>

        {/* Tag breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tagOrder.map((tag) => {
            const meta = TAG_META[tag];
            const count = summary.byTag[tag];
            const pct = summary.total > 0 ? (count / summary.total) * 100 : 0;
            const Icon = meta.icon;
            return (
              <div
                key={tag}
                className="rounded-md border bg-background p-2.5 flex flex-col gap-1"
              >
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 ${meta.cls}`} />
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold tabular-nums">{count}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Layer breakdown */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5 flex items-center gap-1.5">
            <Layers className="h-3 w-3" /> Issues by layer
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map((n) => {
              const count = summary.byLayer[n as 1 | 2 | 3 | 4] ?? 0;
              const labels = ["Structure", "Mandatory", "Business", "Performance"];
              return (
                <div
                  key={n}
                  className="rounded bg-muted/40 px-2 py-1.5 text-center"
                >
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    L{n} · {labels[n - 1]}
                  </div>
                  <div className="text-sm font-bold tabular-nums">{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status bucket distribution */}
        {Object.values(summary.byBucket ?? {}).some((v) => v > 0) && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
              Status mix (operational buckets)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(summary.byBucket) as StatusBucket[])
                .filter((b) => summary.byBucket[b] > 0)
                .sort((a, b) => summary.byBucket[b] - summary.byBucket[a])
                .map((b) => (
                  <Badge
                    key={b}
                    variant="outline"
                    className={`text-[10px] gap-1 ${
                      b === "settled" ? "border-accent text-accent" :
                      b === "denial" || b === "cashless_denied" ? "border-destructive text-destructive" :
                      b === "unknown" ? "border-muted-foreground text-muted-foreground" : ""
                    }`}
                  >
                    {STATUS_BUCKET_LABELS[b]}
                    <span className="font-mono">×{summary.byBucket[b]}</span>
                  </Badge>
                ))}
            </div>
          </div>
        )}

        {/* Cleanup signals: removable + imputed */}
        {(summary.removableCount > 0 || summary.imputedCount > 0 || summary.cohortAvgSubmissionLagDays !== null) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {summary.removableCount > 0 && (
              <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 flex items-start gap-2">
                <Trash2 className="h-3.5 w-3.5 text-warning mt-0.5" />
                <div className="text-[11px] leading-tight">
                  <div className="font-semibold">{summary.removableCount} removable rows</div>
                  <div className="text-muted-foreground">No status & no amounts — safe to delete</div>
                </div>
              </div>
            )}
            {summary.imputedCount > 0 && (
              <div className="rounded-md border border-primary/40 bg-primary/10 p-2.5 flex items-start gap-2">
                <Wand2 className="h-3.5 w-3.5 text-primary mt-0.5" />
                <div className="text-[11px] leading-tight">
                  <div className="font-semibold">{summary.imputedCount} dates imputed</div>
                  <div className="text-muted-foreground">Settled rows · cohort avg submission lag</div>
                </div>
              </div>
            )}
            {summary.cohortAvgSubmissionLagDays !== null && (
              <div className="rounded-md border bg-muted/30 p-2.5 flex items-start gap-2">
                <Layers className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                <div className="text-[11px] leading-tight">
                  <div className="font-semibold">{summary.cohortAvgSubmissionLagDays}d avg</div>
                  <div className="text-muted-foreground">Discharge → submission cohort lag</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ratio warnings (Layer 4) */}
        {summary.ratioWarnings.length > 0 && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-warning-foreground font-semibold">
              Performance ratios outside target
            </div>
            {summary.ratioWarnings.map((w, i) => (
              <div key={i} className="text-[11px] text-warning-foreground">
                ⚠ {w}
              </div>
            ))}
          </div>
        )}

        {/* Top issue codes */}
        {showTopIssues && topIssues.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">
              Top issues
            </div>
            <div className="flex flex-wrap gap-1.5">
              {topIssues.map(([code, count]) => (
                <Badge
                  key={code}
                  variant="outline"
                  className="text-[10px] gap-1"
                  title={code}
                >
                  {ISSUE_CODE_LABELS[code] ?? code}
                  <span className="font-mono text-muted-foreground">×{count}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { TAG_META };
