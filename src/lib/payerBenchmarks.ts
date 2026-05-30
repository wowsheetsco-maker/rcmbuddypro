import type { PayerStats } from "./payerScorecard";

export interface PayerBenchmarks {
  /** Portfolio median for each numeric metric. Excludes payers with 0 claims. */
  median: {
    claims: number;
    uniquePatients: number;
    discPct: number;
    avgTat: number;
    approvalPct: number;
    netRealPct: number;
    score: number;
  };
  /** Top quartile (75th percentile) thresholds — useful for "best in class" framing. */
  topQuartile: {
    netRealPct: number;
    approvalPct: number;
    avgTat: number; // lower is better, so this is actually 25th percentile
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const median = (xs: number[]) => percentile([...xs].sort((a, b) => a - b), 0.5);

/** Compute benchmarks across the visible payer set. */
export function buildBenchmarks(payers: PayerStats[]): PayerBenchmarks {
  const valid = payers.filter((p) => p.claims > 0);
  const tatValid = valid.filter((p) => p.avgTat > 0).map((p) => p.avgTat).sort((a, b) => a - b);
  const nrSorted = valid.map((p) => p.netRealPct).sort((a, b) => a - b);
  const apSorted = valid.map((p) => p.approvalPct).sort((a, b) => a - b);
  return {
    median: {
      claims: Math.round(median(valid.map((p) => p.claims))),
      uniquePatients: Math.round(median(valid.map((p) => p.uniquePatients))),
      discPct: +median(valid.map((p) => p.discPct)).toFixed(1),
      avgTat: Math.round(median(tatValid.length ? tatValid : [0])),
      approvalPct: +median(valid.map((p) => p.approvalPct)).toFixed(1),
      netRealPct: +median(valid.map((p) => p.netRealPct)).toFixed(1),
      score: Math.round(median(valid.map((p) => p.score))),
    },
    topQuartile: {
      netRealPct: +percentile(nrSorted, 0.75).toFixed(1),
      approvalPct: +percentile(apSorted, 0.75).toFixed(1),
      avgTat: Math.round(percentile(tatValid, 0.25)), // 25th percentile = top quartile (lower is better)
    },
  };
}

/** Format the gap between a payer's metric and the portfolio median. */
export function gapVsMedian(
  value: number,
  median: number,
  opts: { lowerIsBetter?: boolean; suffix?: string } = {},
): { text: string; tone: "good" | "bad" | "neutral" } {
  if (median === 0 && value === 0) return { text: "—", tone: "neutral" };
  const diff = value - median;
  if (Math.abs(diff) < 0.5) return { text: "median", tone: "neutral" };
  const better = opts.lowerIsBetter ? diff < 0 : diff > 0;
  const sign = diff > 0 ? "+" : "";
  return {
    text: `${sign}${diff.toFixed(opts.suffix === "%" ? 1 : 0)}${opts.suffix ?? ""}`,
    tone: better ? "good" : "bad",
  };
}
