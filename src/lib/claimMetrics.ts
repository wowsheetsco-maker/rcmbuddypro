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

/** Statuses still awaiting an approval decision — a zero approved amount here
 *  is simply "not decided yet", not a denial. */
export const IN_PROGRESS_RE =
  /initiated|submitted|query|processing|in progress|pending|reminder|reconsideration/i;

export function isOpen(c: Claim): boolean {
  return !SETTLED_STATUSES.has((c.claim_status || "").toLowerCase().trim());
}

/** Zero approval that has aged past this many days counts as a denial. */
export const ZERO_APPROVAL_DENIAL_AGE_DAYS = 10;

/** Age of the claim in days — creation date, else discharge, else admission. */
export function claimAgeDays(c: Claim): number | null {
  const src =
    c.claim_creation_date || c.date_of_discharge || (c as any).date_of_admission;
  if (!src) return null;
  const t = new Date(src).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Approved amount = 0 on a decided claim, or on any claim older than 10 days
 *  → treated as a denial (never outstanding). */
export function isZeroApprovedDenial(c: Claim): boolean {
  const approved = Number((c as any).approved_amount) || 0;
  if (approved > 0) return false;
  const status = (c.claim_status || "").trim();
  if (SETTLED_STATUSES.has(status.toLowerCase())) return false;
  const age = claimAgeDays(c);
  if (age !== null && age > ZERO_APPROVAL_DENIAL_AGE_DAYS) return true;
  if (!status) return false;
  return !IN_PROGRESS_RE.test(status);
}


export function isDenied(c: Claim): boolean {
  return DENIED_RE.test(c.claim_status || "") || isZeroApprovedDenial(c);
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
 * Claim Denied, Pre-Auth Denied) or any claim with Approved Amount = 0 —
 * must NEVER appear under outstanding, recovery, or the priority worklist.
 * They live only on the Denials page.
 */
export function isExcludedFromOutstanding(c: Claim): boolean {
  return isDenied(c) || (Number((c as any).approved_amount) || 0) <= 0;
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
