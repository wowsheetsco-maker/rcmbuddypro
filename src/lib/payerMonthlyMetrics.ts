import type { Claim } from "@/data/mockClaims";
import { SETTLED_STATUSES, DENIED_STATUSES } from "./payerScorecard";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface MonthlyPoint {
  month: string;      // YYYY-MM
  label: string;      // "Apr '25"
  claims: number;
  denied: number;
  denialPct: number;  // 0-100
  approved: number;
  settled: number;
  netRealPct: number; // 0-100
  tatSum: number;
  tatCount: number;
  avgTat: number;     // days
}

function keyFor(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function emptyBuckets(months: number): Map<string, MonthlyPoint> {
  const now = new Date();
  const b = new Map<string, MonthlyPoint>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = keyFor(d);
    b.set(k, {
      month: k,
      label: `${MONTH_LABELS[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`,
      claims: 0, denied: 0, denialPct: 0,
      approved: 0, settled: 0, netRealPct: 0,
      tatSum: 0, tatCount: 0, avgTat: 0,
    });
  }
  return b;
}

function finalize(b: Map<string, MonthlyPoint>): MonthlyPoint[] {
  return Array.from(b.values()).map((p) => ({
    ...p,
    denialPct: p.claims ? +((p.denied / p.claims) * 100).toFixed(1) : 0,
    netRealPct: p.approved ? +((p.settled / p.approved) * 100).toFixed(1) : 0,
    avgTat: p.tatCount ? Math.round(p.tatSum / p.tatCount) : 0,
  }));
}

function addClaim(bucket: MonthlyPoint | undefined, c: Claim) {
  if (!bucket) return;
  bucket.claims += 1;
  bucket.approved += c.approved_amount || 0;
  const status = (c.claim_status || "").toLowerCase().trim();
  if (SETTLED_STATUSES.has(status)) bucket.settled += c.settled_amount || 0;
  if (DENIED_STATUSES.has(status)) bucket.denied += 1;
  if (SETTLED_STATUSES.has(status) && c.payment_update_date && c.claim_creation_date) {
    const s = new Date(c.claim_creation_date).getTime();
    const e = new Date(c.payment_update_date).getTime();
    if (!Number.isNaN(s) && !Number.isNaN(e) && e >= s) {
      const days = Math.floor((e - s) / 86_400_000);
      if (days <= 365) { bucket.tatSum += days; bucket.tatCount += 1; }
    }
  }
}

/** Per-payer trailing-N monthly metrics. */
export function buildPayerMonthly(
  claims: Claim[],
  payerName: string,
  view: "tpa" | "insurer",
  months = 6,
): MonthlyPoint[] {
  const needle = payerName.toLowerCase().trim();
  const buckets = emptyBuckets(months);
  for (const c of claims) {
    if (!c.claim_creation_date) continue;
    const name = view === "tpa" ? c.tpa_name : (c.insurance_company_name || c.tpa_name);
    if ((name || "").toLowerCase().trim() !== needle) continue;
    const d = new Date(c.claim_creation_date);
    if (Number.isNaN(d.getTime())) continue;
    addClaim(buckets.get(keyFor(d)), c);
  }
  return finalize(buckets);
}

/** Peer (portfolio-wide) monthly average across all payers in the view. */
export function buildPeerMonthly(
  claims: Claim[],
  view: "tpa" | "insurer",
  months = 6,
): MonthlyPoint[] {
  const buckets = emptyBuckets(months);
  for (const c of claims) {
    if (!c.claim_creation_date) continue;
    const name = view === "tpa" ? c.tpa_name : (c.insurance_company_name || c.tpa_name);
    if (!name) continue;
    const d = new Date(c.claim_creation_date);
    if (Number.isNaN(d.getTime())) continue;
    addClaim(buckets.get(keyFor(d)), c);
  }
  return finalize(buckets);
}
