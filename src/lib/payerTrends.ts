import type { Claim } from "@/data/mockClaims";
import { SETTLED_STATUSES } from "./payerScorecard";

export interface TrendPoint {
  /** YYYY-MM key. */
  month: string;
  label: string; // "Apr '25"
  claims: number;
  approved: number;
  settled: number;
  netRealPct: number;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Build a 6-month trend window for one payer. */
export function buildPayerTrend(
  claims: Claim[],
  payerName: string,
  view: "tpa" | "insurer",
  months = 6,
): TrendPoint[] {
  const needle = payerName.toLowerCase().trim();
  const filtered = claims.filter((c) => {
    const name = view === "tpa" ? c.tpa_name : c.insurance_company_name || c.tpa_name;
    return (name || "").toLowerCase().trim() === needle;
  });

  // Build the trailing-N month bucket list ending at the current month.
  const now = new Date();
  const buckets = new Map<string, TrendPoint>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, {
      month: key,
      label: `${MONTH_LABELS[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`,
      claims: 0,
      approved: 0,
      settled: 0,
      netRealPct: 0,
    });
  }

  for (const c of filtered) {
    if (!c.claim_creation_date) continue;
    const d = new Date(c.claim_creation_date);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const b = buckets.get(key);
    if (!b) continue;
    b.claims += 1;
    b.approved += c.approved_amount || 0;
    if (SETTLED_STATUSES.has((c.claim_status || "").toLowerCase().trim())) {
      b.settled += c.settled_amount || 0;
    }
  }

  return Array.from(buckets.values()).map((b) => ({
    ...b,
    netRealPct: b.approved > 0 ? +((b.settled / b.approved) * 100).toFixed(1) : 0,
  }));
}
