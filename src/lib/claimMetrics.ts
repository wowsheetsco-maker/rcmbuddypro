/**
 * Shared KPI calculations for claims across pages.
 *
 * Use these helpers anywhere a dashboard tile needs to display open-claim,
 * outstanding, SLA-breach, denial, or discrepancy counts. Keeping the
 * definitions here avoids drift between Today's Worklist, Priority Worklist,
 * Discrepancy Tracker, Outstanding Reminders, scorecards, and the dashboards.
 */
import type { Claim } from "@/data/mockClaims";

export const SETTLED_STATUSES = new Set([
  "settled",
  "paid",
  "closed",
  "claim settled",
]);

export const DENIED_RE = /denied|rejected|repudiat/i;
export const PREAUTH_RE = /pre[\s-]?auth/i;

export function isOpen(c: Claim): boolean {
  return !SETTLED_STATUSES.has((c.claim_status || "").toLowerCase().trim());
}

export function isDenied(c: Claim): boolean {
  return DENIED_RE.test(c.claim_status || "");
}

/** True if the claim's status refers to the pre-authorization stage. */
export function isPreauth(c: Claim): boolean {
  return PREAUTH_RE.test(c.claim_status || "");
}

/** Pre-auth denied claims — must NEVER appear under outstanding / recovery. */
export function isPreauthDenied(c: Claim): boolean {
  return isPreauth(c) && isDenied(c);
}

/**
 * Any denied/rejected/repudiated claim (including Enhancement Denied,
 * Claim Denied, Pre-Auth Denied) — must NEVER appear under outstanding,
 * recovery, or the priority worklist. They live only on the Denials page.
 */
export function isExcludedFromOutstanding(c: Claim): boolean {
  return isDenied(c);
}

/**
 * Effective outstanding for a single claim.
 * Rule: outstanding = max(0, approved_amount - settled_amount - tds_amount).
 * Denied/rejected claims and claims with zero approved amount contribute 0
 * and are not counted toward outstanding totals.
 */
export function effectiveOutstanding(c: Claim): number {
  if (isExcludedFromOutstanding(c)) return 0;
  const approved = Number((c as any).approved_amount) || 0;
  if (approved <= 0) return 0;
  const settled = Number(c.settled_amount) || 0;
  const tds = Number((c as any).tds_amount) || 0;
  return Math.max(0, approved - settled - tds);
}

/** True if this claim contributes to outstanding KPIs (count and amount). */
export function hasOutstanding(c: Claim): boolean {
  return effectiveOutstanding(c) > 0;
}

/** Canonical SLA breach flag — sourced from import-time derived field. */
export function isSlaBreach(c: Claim): boolean {
  return Boolean(c.is_irdai_breach);
}

export function countOpen(claims: Claim[]): number {
  return claims.filter(isOpen).length;
}

export function countSlaBreaches(claims: Claim[]): number {
  return claims.filter((c) => isOpen(c) && isSlaBreach(c) && hasOutstanding(c)).length;
}

export function countOpenDenials(claims: Claim[]): number {
  return claims.filter((c) => isOpen(c) && isDenied(c) && effectiveOutstanding(c) > 0).length;
}

export function sumOutstanding(claims: Claim[]): number {
  return claims.reduce((s, c) => s + effectiveOutstanding(c), 0);
}

export function sumOutstandingOpen(claims: Claim[]): number {
  return claims.reduce((s, c) => s + (isOpen(c) ? effectiveOutstanding(c) : 0), 0);
}

export function sumClaimed(claims: Claim[]): number {
  return claims.reduce((s, c) => s + (c.claimed_amount || 0), 0);
}

export function sumSettled(claims: Claim[]): number {
  return claims.reduce((s, c) => s + (c.settled_amount || 0), 0);
}

/** Unified totals snapshot — handy for dashboard KPI strips. */
export function claimTotals(claims: Claim[]) {
  return {
    total: claims.length,
    open: countOpen(claims),
    slaBreaches: countSlaBreaches(claims),
    openDenials: countOpenDenials(claims),
    outstanding: sumOutstanding(claims),
    outstandingOpen: sumOutstandingOpen(claims),
    claimed: sumClaimed(claims),
    settled: sumSettled(claims),
  };
}
