// Discrepancy detection — classic short-payment formula with configurable
// ₹ + % thresholds and severity bands. Pure TS so it can run client-side
// against the live claims list and from the bulk-email edge function.

import type { DqRules } from "./dataQualityEngine";

export type DiscrepancyBand = "low" | "medium" | "high";

export interface DiscrepancyMetrics {
  isDiscrepant: boolean;
  /** Approved − (Settled + TDS). Negative or zero = no discrepancy. */
  amount: number;
  /** amount / approved × 100. 0 if approved <= 0. */
  pct: number;
  band: DiscrepancyBand | null;
  /** Whether the claim is in a state that can be flagged (closed/settled). */
  isClosed: boolean;
}

const SETTLED_STATUSES = new Set([
  "settled",
  "paid",
  "closed",
  "completed",
]);

export interface DiscrepancyClaim {
  claim_status?: string | null;
  approved_amount?: number | null;
  settled_amount?: number | null;
  tds_amount?: number | null;
}

/**
 * Compute discrepancy metrics for a single claim.
 * Classic short-payment formula: gap = Approved − (Settled + TDS).
 * Flagged when gap > MAX(rules.discrepancy_min_inr, rules.discrepancy_min_pct% of approved).
 */
export function computeDiscrepancy(
  c: DiscrepancyClaim,
  rules: Pick<
    DqRules,
    | "discrepancy_min_inr"
    | "discrepancy_min_pct"
    | "discrepancy_low_pct"
    | "discrepancy_high_pct"
  >,
): DiscrepancyMetrics {
  const approved = Number(c.approved_amount ?? 0);
  const settled = Number(c.settled_amount ?? 0);
  const tds = Number(c.tds_amount ?? 0);
  const status = (c.claim_status ?? "").toLowerCase().trim();
  const isClosed = SETTLED_STATUSES.has(status);

  const amount = approved - (settled + tds);
  const pct = approved > 0 ? (amount / approved) * 100 : 0;

  // Only meaningful for closed/settled claims with an approval
  if (!isClosed || approved <= 0 || amount <= 0) {
    return { isDiscrepant: false, amount: Math.max(0, amount), pct: Math.max(0, pct), band: null, isClosed };
  }

  const minInr = rules.discrepancy_min_inr || 0;
  const minPct = rules.discrepancy_min_pct || 0;
  const inrThreshold = minInr;
  const pctThreshold = (approved * minPct) / 100;
  const threshold = Math.max(inrThreshold, pctThreshold);

  const isDiscrepant = amount > threshold;
  if (!isDiscrepant) {
    return { isDiscrepant: false, amount, pct, band: null, isClosed };
  }

  let band: DiscrepancyBand = "medium";
  if (pct < rules.discrepancy_low_pct) band = "low";
  else if (pct > rules.discrepancy_high_pct) band = "high";

  return { isDiscrepant: true, amount, pct, band, isClosed };
}

export const BAND_META: Record<DiscrepancyBand, { label: string; cls: string; ring: string }> = {
  low: {
    label: "LOW",
    cls: "bg-success/15 text-success border-success/40",
    ring: "ring-success/30",
  },
  medium: {
    label: "MED",
    cls: "bg-warning/20 text-warning border-warning/40",
    ring: "ring-warning/30",
  },
  high: {
    label: "HIGH",
    cls: "bg-destructive/15 text-destructive border-destructive/40",
    ring: "ring-destructive/30",
  },
};

export function inrShort(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
