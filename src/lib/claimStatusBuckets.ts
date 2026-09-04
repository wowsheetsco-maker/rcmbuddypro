/**
 * Single source of truth for claim status bucketing used by the Executive
 * Dashboard and related reconciliation widgets.
 *
 * Keep this file dependency-free so the calculations can be unit tested
 * without pulling in React or Supabase.
 */

export interface StatusedClaim {
  claim_status?: string | null;
  date_of_discharge?: string | null;
  date_of_admission?: string | null;
  claim_creation_date?: string | null;
  approved_amount?: number | null;
  claimed_amount?: number | null;
  settled_amount?: number | null;
}

const norm = (s?: string | null) => (s || "").toLowerCase().trim();

/** Age of a claim in days, using creation date then discharge then admission. */
export function claimAgeDays(c: StatusedClaim): number | null {
  const src = c.claim_creation_date || c.date_of_discharge || c.date_of_admission;
  if (!src) return null;
  const t = new Date(src).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Business rule: zero approval that has aged past this many days = denial. */
export const ZERO_APPROVAL_DENIAL_AGE_DAYS = 10;


export const SETTLED_STATUSES = new Set<string>([
  "settled", "paid", "closed",
]);

export const DENIED_STATUSES = new Set<string>([
  "pre auth denied", "claim denied", "discharge denied",
  "enhancement denied", "denied", "rejected",
]);

/**
 * Submitted = claim has been (or is past the act of being) submitted to the
 * payer. By definition Submitted ⊇ Settled, and Submitted amount uses the
 * approved amount so Submitted (₹) ≤ Approved (₹).
 */
export const SUBMITTED_STATUSES = new Set<string>([
  "settled", "paid", "closed",
  "settlement initiated", "settlement reminder",
  "claim denied", "denied", "rejected",
  "reconsideration submitted",
  "processing", "claim in progress", "in progress",
  "claim query", "query",
]);

/**
 * Documents-to-be-submitted = claim is approved (any stage) AND patient
 * has been discharged, but the file is not yet in a "submitted" status.
 */
export const DOCS_TO_SUBMIT_STATUSES = new Set<string>([
  "claim approved", "discharge approved",
  "pre auth approved", "pre-auth approved",
]);

/** Statuses still awaiting an approval decision — zero approved is not a denial. */
const IN_PROGRESS_RE =
  /initiated|submitted|query|processing|in progress|pending|reminder|reconsideration/i;

export const isSettled = (c: StatusedClaim) => SETTLED_STATUSES.has(norm(c.claim_status));
export const isDenied = (c: StatusedClaim) => {
  if (DENIED_STATUSES.has(norm(c.claim_status))) return true;
  // Approved Amount = 0 on a decided claim → denial, never outstanding.
  const approved = Number(c.approved_amount || 0);
  const status = (c.claim_status || "").trim();
  if (SETTLED_STATUSES.has(norm(status))) return false;
  if (approved > 0) return false;
  // Zero approval older than 10 days is a denial even if still "in progress".
  const age = claimAgeDays(c);
  if (age !== null && age > ZERO_APPROVAL_DENIAL_AGE_DAYS) return true;
  return !!status && !IN_PROGRESS_RE.test(status);
};

export const isSubmitted = (c: StatusedClaim) => SUBMITTED_STATUSES.has(norm(c.claim_status));
export const isDocsToSubmit = (c: StatusedClaim) =>
  !!c.date_of_discharge && DOCS_TO_SUBMIT_STATUSES.has(norm(c.claim_status));

export interface ReconciliationBucket {
  count: number;
  amount: number;
}

export interface ReconciliationReport {
  approved: ReconciliationBucket;
  submitted: ReconciliationBucket;
  settled: ReconciliationBucket;
  docsToSubmit: ReconciliationBucket;
  /** Mismatches that should never occur if the rules above hold. */
  warnings: string[];
}

/**
 * Compute the reconciliation report for a set of claims. Also returns a list
 * of human-readable warnings when the invariants are violated (e.g. Submitted
 * count/amount exceeds Approved). Safe to call on every render.
 */
export function computeReconciliation(claims: StatusedClaim[]): ReconciliationReport {
  let approvedCount = 0, approvedAmt = 0;
  let submittedCount = 0, submittedAmt = 0;
  let settledCount = 0, settledAmt = 0;
  let docsCount = 0, docsAmt = 0;

  for (const c of claims) {
    const approved = Number(c.approved_amount || 0);
    if (approved > 0) {
      approvedCount += 1;
      approvedAmt += approved;
    }
    if (isSubmitted(c)) {
      submittedCount += 1;
      submittedAmt += approved; // intentional: see SUBMITTED_STATUSES doc
    }
    if (isSettled(c)) {
      settledCount += 1;
      settledAmt += Number(c.settled_amount || 0);
    }
    if (isDocsToSubmit(c)) {
      docsCount += 1;
      docsAmt += approved || Number(c.claimed_amount || 0);
    }
  }

  const warnings: string[] = [];
  if (submittedCount > approvedCount) {
    warnings.push(`Submitted count (${submittedCount}) exceeds Approved count (${approvedCount}).`);
  }
  if (submittedAmt > approvedAmt + 0.01) {
    warnings.push(`Submitted amount (${submittedAmt.toFixed(2)}) exceeds Approved amount (${approvedAmt.toFixed(2)}).`);
  }
  if (settledCount > submittedCount) {
    warnings.push(`Settled count (${settledCount}) exceeds Submitted count (${submittedCount}).`);
  }

  return {
    approved: { count: approvedCount, amount: approvedAmt },
    submitted: { count: submittedCount, amount: submittedAmt },
    settled: { count: settledCount, amount: settledAmt },
    docsToSubmit: { count: docsCount, amount: docsAmt },
    warnings,
  };
}
