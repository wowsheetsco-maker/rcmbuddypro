// 🧠 Data Quality Engine — RCM gold-standard, 4-layer validator.
// Pure TS so it can run in the browser (import-time gate) AND be reused for
// retroactive scans of existing rows fetched from the DB.
//
// Layer 1: Structural Validation        — file-level (mandatory headers)
// Layer 2: Mandatory Field Validation   — row-level hard stops
// Layer 3: Business Logic Validation    — financial / date / TAT / dup / process
// Layer 4: RCM Performance Validation   — outliers, ratios, anomalies
//
// Output schema (per row):
//   { tag: "clean" | "warning" | "error" | "critical", issues: Issue[] }

export type DqTag = "clean" | "warning" | "error" | "critical";
export type DqLayer = 1 | 2 | 3 | 4;
export type DqSeverity = "info" | "warning" | "error" | "critical";

export interface DqIssue {
  layer: DqLayer;
  severity: DqSeverity;
  code: string;
  message: string;
  field?: string;
}

export interface DqResult {
  tag: DqTag;
  issues: DqIssue[];
  /** Bucketed status meaning, derived from raw claim_status (after approved-amount override). */
  statusBucket?: StatusBucket;
  /** True when row should be safely removed (no signal — junk OR fails inclusion gate). */
  removable?: boolean;
  /** When doc_submission_date is missing but imputed via cohort average. */
  imputedSubmissionDate?: string | null;
  /** Row passes the 5 inclusion rules — counted in dashboards/analytics. */
  included?: boolean;
  /** Specific reasons the row was excluded (when included=false). */
  exclusionReasons?: string[];
  /** True when bucket was overridden because approved_amount=0. */
  bucketOverridden?: boolean;
}

export interface DqRules {
  submission_warn_days: number;        // Layer 3 — TAT
  approval_escalate_days: number;      // Layer 3 — TAT
  settlement_critical_days: number;    // Layer 3 — TAT
  zero_approval_risk_days: number;     // Layer 3 — Zero approval
  high_value_claim_inr: number;        // Layer 4 — outlier
  min_approval_rate_pct: number;       // Layer 4 — ratio
  max_denial_rate_pct: number;         // Layer 4 — ratio
  max_avg_tat_days: number;            // Layer 4 — ratio
  // Discrepancy tracker — short-payment detection
  // A claim is "discrepant" when (Approved − (Settled + TDS)) > MAX(amount, % of approved).
  // Set either threshold to 0 to disable that side of the check.
  discrepancy_min_inr: number;         // absolute ₹ threshold
  discrepancy_min_pct: number;         // % of approved threshold
  discrepancy_low_pct: number;         // band: < low_pct → LOW
  discrepancy_high_pct: number;        // band: > high_pct → HIGH (between = MED)
}

export const DEFAULT_DQ_RULES: DqRules = {
  submission_warn_days: 3,
  approval_escalate_days: 10,
  settlement_critical_days: 30,
  zero_approval_risk_days: 7,
  high_value_claim_inr: 1_000_000,
  min_approval_rate_pct: 70,
  max_denial_rate_pct: 15,
  max_avg_tat_days: 30,
  discrepancy_min_inr: 100,
  discrepancy_min_pct: 1,
  discrepancy_low_pct: 5,
  discrepancy_high_pct: 15,
};

// Minimal claim shape this engine accepts. Both parsed-import rows and DB rows
// satisfy this interface.
export interface DqClaim {
  claim_number: string;
  patient_name?: string | null;
  tpa_name?: string | null;
  insurance_company_name?: string | null;
  claim_status?: string | null;
  claim_creation_date?: string | null;          // YYYY-MM-DD
  date_of_admission?: string | null;
  date_of_discharge?: string | null;
  doc_submission_date?: string | null;
  payment_update_date?: string | null;
  in_patient_number?: string | null;
  policy_number?: string | null;
  claimed_amount?: number | null;
  approved_amount?: number | null;
  settled_amount?: number | null;
  outstanding_amount?: number | null;
  treatment?: string | null;
}

// ---------- STATUS BUCKETS ---------------------------------------------------
// Operational meaning of each raw claim_status string. Drives whether
// doc-submission / approval / settlement validations apply at all.

export type StatusBucket =
  | "settled"           // money received, closed
  | "submitted"         // docs submitted, awaiting payer action
  | "not_submitted"     // approved or pre-auth-stage; docs not yet sent
  | "under_process"     // payer reviewing
  | "active_claim"      // pre-auth / query loop in progress
  | "denial"            // claim denied (full/partial)
  | "cashless_denied"   // cashless denied — appeal or reimbursement path
  | "not_utilised"      // cancelled, never used
  | "unknown";

// Map raw status → bucket. Keys are lowercased + trimmed.
const STATUS_BUCKET_MAP: Record<string, StatusBucket> = {
  // SETTLED
  "settled": "settled",
  "paid": "settled",
  "closed": "settled",
  "completed": "settled",
  "claim settled": "settled",

  // NOT UTILISED
  "cancelled": "not_utilised",
  "canceled": "not_utilised",

  // NOT SUBMITTED
  "discharge approved": "not_submitted",
  "pre auth approved": "not_submitted",
  "pre-auth approved": "not_submitted",
  "preauth approved": "not_submitted",

  // SUBMITTED
  "claim approved": "submitted",
  "settlement initiated": "submitted",

  // DENIAL
  "pre auth denied": "denial",
  "pre-auth denied": "denial",
  "preauth denied": "denial",
  "discharge denied": "denial",

  // CASHLESS DENIED
  "claim denied": "cashless_denied",

  // UNDER PROCESS
  "processing": "under_process",
  "claim in progress": "under_process",
  "settlementreminder": "under_process",
  "settlement reminder": "under_process",
  "claim query": "under_process",
  "reconsideration submitted": "under_process",

  // ACTIVE CLAIM
  "pre auth query": "active_claim",
  "pre-auth query": "active_claim",
  "preauth query": "active_claim",
  "pre auth query replied": "active_claim",
  "pre-auth query replied": "active_claim",
  "preauth query replied": "active_claim",
  "pre auth submitted to payer": "active_claim",
  "pre-auth submitted to payer": "active_claim",
  "preauth submitted to payer": "active_claim",
  "enhancement approved": "active_claim",
  "enhancement denied": "active_claim",
  "discharge initiated": "active_claim",
};

export function bucketOfStatus(status: string | null | undefined): StatusBucket {
  if (!status) return "unknown";
  const k = status.toLowerCase().trim().replace(/\s+/g, " ");
  return STATUS_BUCKET_MAP[k] ?? "unknown";
}

export const STATUS_BUCKET_LABELS: Record<StatusBucket, string> = {
  settled: "Settled",
  submitted: "Submitted",
  not_submitted: "Not Submitted",
  under_process: "Under Process",
  active_claim: "Active Claim",
  denial: "Denial",
  cashless_denied: "Cashless Denied",
  not_utilised: "Not Utilised",
  unknown: "Unknown",
};

// Buckets where doc submission is NOT yet expected (so don't fail on missing date)
const NO_SUBMISSION_EXPECTED: ReadonlySet<StatusBucket> = new Set([
  "not_submitted",
  "active_claim",
  "not_utilised",
  "denial",
]);

// Buckets that count as "closed" (terminal) for TAT logic
const CLOSED_BUCKETS: ReadonlySet<StatusBucket> = new Set([
  "settled",
  "denial",
  "cashless_denied",
  "not_utilised",
]);

// ---------- helpers ----------------------------------------------------------

function dayDiff(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.floor((tb - ta) / 86_400_000);
}

function daysFromTo(date: string | null | undefined, to: Date = new Date()): number | null {
  if (!date) return null;
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const today = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((today - t) / 86_400_000);
}

function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  const d = new Date(t + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function tagFromIssues(issues: DqIssue[]): DqTag {
  if (issues.some((i) => i.severity === "critical")) return "critical";
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "clean";
}

// ---------- LAYER 1: structural ---------------------------------------------

export const MANDATORY_HEADERS = [
  "claim number",
  "patient name",
  "date of admission",
  "claimed amount",
  "claim status",
] as const;

export interface StructuralResult {
  ok: boolean;
  missing: string[];
  duplicateHeaders: string[];
}

/**
 * Layer 1 — validate the SHAPE of an incoming file before any rows are parsed.
 * `headers` should be the header row as detected (any case / whitespace).
 *
 * Rule: missing mandatory column → REJECT entire file.
 */
export function validateStructure(headers: string[]): StructuralResult {
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const missing = MANDATORY_HEADERS.filter((m) => !norm.includes(m));
  // duplicate header detection
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const h of norm) {
    if (!h) continue;
    if (seen.has(h)) dups.add(h);
    seen.add(h);
  }
  return {
    ok: missing.length === 0 && dups.size === 0,
    missing,
    duplicateHeaders: Array.from(dups),
  };
}

// ---------- LAYER 2: mandatory fields ---------------------------------------

function layer2(c: DqClaim, bucket: StatusBucket, issues: DqIssue[]): void {
  // Hard stops
  if (!c.claim_number || !c.claim_number.trim()) {
    issues.push({ layer: 2, severity: "critical", code: "L2_CLAIM_NO_MISSING", field: "claim_number", message: "Claim number missing" });
  }
  if (!c.patient_name || !c.patient_name.trim()) {
    issues.push({ layer: 2, severity: "critical", code: "L2_PATIENT_MISSING", field: "patient_name", message: "Patient name missing" });
  }
  if (!c.date_of_admission) {
    issues.push({ layer: 2, severity: "critical", code: "L2_ADMISSION_MISSING", field: "date_of_admission", message: "Admission date missing" });
  }
  if ((c.claimed_amount ?? 0) <= 0) {
    issues.push({ layer: 2, severity: "critical", code: "L2_CLAIMED_INVALID", field: "claimed_amount", message: "Claimed amount must be > 0" });
  }
  if (!c.claim_status || !c.claim_status.trim()) {
    issues.push({ layer: 2, severity: "critical", code: "L2_STATUS_MISSING", field: "claim_status", message: "Status missing" });
  }

  // Soft warnings (still allowed). Skip IP / discharge for pre-auth / not-utilised.
  if (!c.in_patient_number && bucket !== "active_claim" && bucket !== "not_utilised") {
    issues.push({ layer: 2, severity: "warning", code: "L2_IP_NO_MISSING", field: "in_patient_number", message: "IP Number missing" });
  }
  if (!c.date_of_discharge && bucket !== "active_claim" && bucket !== "not_utilised") {
    issues.push({ layer: 2, severity: "warning", code: "L2_DISCHARGE_MISSING", field: "date_of_discharge", message: "Discharge date missing" });
  }
  if (!c.tpa_name) {
    issues.push({ layer: 2, severity: "warning", code: "L2_TPA_MISSING", field: "tpa_name", message: "TPA name missing" });
  }
  if (!c.policy_number) {
    issues.push({ layer: 2, severity: "warning", code: "L2_POLICY_MISSING", field: "policy_number", message: "Policy number missing" });
  }
}

// ---------- LAYER 3: business logic -----------------------------------------

function layer3(c: DqClaim, bucket: StatusBucket, rules: DqRules, issues: DqIssue[]): void {
  const claimed = c.claimed_amount ?? 0;
  const approved = c.approved_amount ?? 0;
  const settled = c.settled_amount ?? 0;
  const isClosed = CLOSED_BUCKETS.has(bucket);

  // 💰 Financial logic
  if (claimed < 0) {
    issues.push({ layer: 3, severity: "critical", code: "L3_NEG_CLAIMED", field: "claimed_amount", message: "Claimed amount is negative" });
  }
  if (approved < 0) {
    issues.push({ layer: 3, severity: "critical", code: "L3_NEG_APPROVED", field: "approved_amount", message: "Approved amount is negative" });
  }
  if (settled < 0) {
    issues.push({ layer: 3, severity: "critical", code: "L3_NEG_SETTLED", field: "settled_amount", message: "Settled amount is negative" });
  }
  if (approved > claimed && claimed > 0) {
    issues.push({ layer: 3, severity: "error", code: "L3_APPROVED_GT_CLAIMED", message: `Approved (${approved}) > Claimed (${claimed})` });
  }
  if (settled > approved && approved > 0) {
    issues.push({ layer: 3, severity: "error", code: "L3_SETTLED_GT_APPROVED", message: `Settled (${settled}) > Approved (${approved})` });
  }

  // 📅 Date logic
  const admToDis = dayDiff(c.date_of_admission, c.date_of_discharge);
  if (admToDis !== null && admToDis < 0) {
    issues.push({ layer: 3, severity: "critical", code: "L3_DATE_DIS_BEFORE_ADM", message: "Discharge before admission" });
  }
  // NOTE: `claim_creation_date` is often the pre-authorization date, which is
  // legitimately BEFORE discharge (and even before admission is impossible).
  // So we only flag a genuine impossibility: claim/pre-auth date before admission.
  const admToClaim = dayDiff(c.date_of_admission, c.claim_creation_date);
  if (admToClaim !== null && admToClaim < 0) {
    issues.push({ layer: 3, severity: "critical", code: "L3_DATE_CLAIM_BEFORE_ADM", message: "Claim/pre-auth date before admission" });
  }
  const claimToPay = dayDiff(c.claim_creation_date, c.payment_update_date);
  if (claimToPay !== null && claimToPay < 0) {
    issues.push({ layer: 3, severity: "critical", code: "L3_DATE_PAY_BEFORE_CLAIM", message: "Payment date before claim date" });
  }

  // ⏱️ TAT checks (only for OPEN claims — closed claims are historical)
  if (!isClosed) {
    // Submission delay: only when bucket EXPECTS submission to have happened.
    if (!NO_SUBMISSION_EXPECTED.has(bucket)) {
      const subDelay = dayDiff(c.date_of_discharge, c.doc_submission_date) ?? daysFromTo(c.date_of_discharge);
      if (c.date_of_discharge && !c.doc_submission_date && subDelay !== null && subDelay > rules.submission_warn_days) {
        issues.push({ layer: 3, severity: "warning", code: "L3_TAT_SUBMISSION", message: `Not submitted ${subDelay}d after discharge (>${rules.submission_warn_days}d)` });
      }
    }
    // Approval escalation
    if (c.claim_creation_date && approved === 0 && (daysFromTo(c.claim_creation_date) ?? 0) > rules.approval_escalate_days) {
      issues.push({ layer: 3, severity: "error", code: "L3_TAT_APPROVAL", message: `No approval ${daysFromTo(c.claim_creation_date)}d after claim creation (>${rules.approval_escalate_days}d)` });
    }
    // Settlement critical
    if (c.claim_creation_date && settled === 0 && (daysFromTo(c.claim_creation_date) ?? 0) > rules.settlement_critical_days) {
      issues.push({ layer: 3, severity: "critical", code: "L3_TAT_SETTLEMENT", message: `No settlement ${daysFromTo(c.claim_creation_date)}d after claim creation (>${rules.settlement_critical_days}d)` });
    }
  }

  // 🚨 Zero-approval intelligence — skip for not-yet-approved buckets
  const ageDays = daysFromTo(c.claim_creation_date);
  if (
    !isClosed
    && bucket !== "active_claim"
    && bucket !== "not_submitted"
    && approved === 0
    && ageDays !== null
    && ageDays > rules.zero_approval_risk_days
  ) {
    issues.push({ layer: 3, severity: "error", code: "L3_ZERO_APPROVAL_RISK", message: `Zero approval after ${ageDays}d — High Risk Claim` });
  }

  // 🧾 Process failures
  // Only flag missing submission for buckets that EXPECT it.
  if (!c.doc_submission_date && !isClosed && !NO_SUBMISSION_EXPECTED.has(bucket)) {
    issues.push({ layer: 3, severity: "warning", code: "L3_NO_SUBMISSION", message: "Process failure: no submission date logged" });
  }
  // Settled claims should have payment date — but it's an error not critical
  // (per new rule: settled = always valid).
  if (!c.payment_update_date && bucket === "settled") {
    issues.push({ layer: 3, severity: "warning", code: "L3_PAID_NO_PAY_DATE", message: "Settled but no payment date logged" });
  }
  if (!c.date_of_discharge && (c.date_of_admission && (daysFromTo(c.date_of_admission) ?? 0) > 30) && bucket !== "active_claim") {
    issues.push({ layer: 3, severity: "warning", code: "L3_NO_DISCHARGE", message: "Incomplete case: no discharge date after 30d" });
  }

  // 📌 Pending-for-doc-submission signal
  // If approved AND discharge is today/tomorrow AND no submission date logged,
  // surface as info-level guidance (not an error).
  if (approved > 0 && bucket === "not_submitted" && c.date_of_discharge) {
    const disLag = daysFromTo(c.date_of_discharge);
    if (disLag !== null && disLag <= 1 && !c.doc_submission_date) {
      issues.push({ layer: 3, severity: "info", code: "L3_PENDING_DOC_SUBMISSION", message: "Approved — pending for doc submission" });
    }
  }
}

// Layer-3 duplicate detection runs ACROSS rows (cross-row analysis), so it has
// its own pass.
function layer3Duplicates(rows: DqClaim[], perRowIssues: DqIssue[][]): void {
  const byClaimNo = new Map<string, number[]>();
  const byTriple = new Map<string, number[]>();
  rows.forEach((r, i) => {
    if (r.claim_number) {
      const k = r.claim_number.trim();
      const arr = byClaimNo.get(k) ?? [];
      arr.push(i);
      byClaimNo.set(k, arr);
    }
    if (r.patient_name && r.date_of_admission && r.claimed_amount) {
      const k = `${r.patient_name.toLowerCase().trim()}|${r.date_of_admission}|${r.claimed_amount}`;
      const arr = byTriple.get(k) ?? [];
      arr.push(i);
      byTriple.set(k, arr);
    }
  });
  for (const [, idxs] of byClaimNo) {
    if (idxs.length > 1) {
      idxs.forEach((i) =>
        perRowIssues[i].push({
          layer: 3, severity: "error", code: "L3_DUP_CLAIM_NO",
          message: `Duplicate claim number (appears ${idxs.length}x)`,
        }),
      );
    }
  }
  for (const [, idxs] of byTriple) {
    if (idxs.length > 1) {
      idxs.forEach((i) =>
        perRowIssues[i].push({
          layer: 3, severity: "error", code: "L3_DUP_PATIENT_DATE_AMT",
          message: `Possible duplicate (same patient + admission + amount, ${idxs.length}x)`,
        }),
      );
    }
  }
}

// ---------- LAYER 4: performance / outliers ---------------------------------

function layer4(c: DqClaim, bucket: StatusBucket, rules: DqRules, issues: DqIssue[]): void {
  const claimed = c.claimed_amount ?? 0;
  const settled = c.settled_amount ?? 0;

  // 📊 Outlier — high value
  if (claimed > rules.high_value_claim_inr) {
    issues.push({ layer: 4, severity: "warning", code: "L4_HIGH_VALUE", message: `High-value claim (₹${(claimed / 100000).toFixed(1)}L) — verify` });
  }
  // Settled but zero settlement — likely error
  if (bucket === "settled" && settled === 0 && claimed > 0) {
    issues.push({ layer: 4, severity: "error", code: "L4_CLOSED_NO_SETTLE", message: "Settled but settled_amount=0 — data error" });
  }
  // Department/treatment vs amount (heuristic — a few well-known cheap procedures)
  const treatment = (c.treatment ?? "").toLowerCase();
  if (treatment.includes("cataract") && claimed > 100_000) {
    issues.push({ layer: 4, severity: "warning", code: "L4_DEPT_AMOUNT", message: `Cataract claim ₹${claimed.toLocaleString("en-IN")} unusually high` });
  }
  if (treatment.includes("dialysis") && claimed > 50_000) {
    issues.push({ layer: 4, severity: "warning", code: "L4_DEPT_AMOUNT", message: `Dialysis claim ₹${claimed.toLocaleString("en-IN")} unusually high — verify` });
  }
}

/**
 * 🚪 INCLUSION GATE — simplified 3 rules (per user spec).
 * A row is INCLUDED in dashboards/analytics ONLY if ALL of these hold:
 *   1. Claim number exists
 *   2. Status exists
 *   3. Approved amount > 0
 * Duplicate claim numbers are also excluded (handled in scoreMany cross-row pass).
 * Rows that fail are marked removable + excluded from counts.
 */
function inclusionCheck(c: DqClaim): { included: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!c.claim_number || !c.claim_number.trim()) reasons.push("Claim number missing");
  if (!c.claim_status || !c.claim_status.trim()) reasons.push("Status missing");
  if ((c.approved_amount ?? 0) <= 0) reasons.push("Approved amount ≤ 0");
  return { included: reasons.length === 0, reasons };
}

/**
 * 🎯 BUCKET OVERRIDE for approved_amount = 0.
 * Per business rule:
 *   - approved_amount = 0 → treat as DENIED claim
 *   - …UNLESS date_of_admission is within [today, today+7 days] → ACTIVE claim
 * This override applies only when the row is INCLUDED and not already in
 * a terminal/closed state (settled/not_utilised) where the raw status wins.
 */
function applyApprovedAmountOverride(
  c: DqClaim,
  bucket: StatusBucket,
): { bucket: StatusBucket; overridden: boolean } {
  const approved = c.approved_amount ?? 0;
  if (approved !== 0) return { bucket, overridden: false };

  // Don't override if already settled / not-utilised — those are terminal truths.
  if (bucket === "settled" || bucket === "not_utilised") {
    return { bucket, overridden: false };
  }

  const doaLag = daysFromTo(c.date_of_admission); // negative = future
  // Future or today's admission within 7 days = active claim
  if (doaLag !== null && doaLag <= 0 && doaLag >= -7) {
    return { bucket: "active_claim", overridden: bucket !== "active_claim" };
  }
  // Otherwise approved=0 → denied
  return { bucket: "cashless_denied", overridden: bucket !== "cashless_denied" };
}

/**
 * "Removable" = fails inclusion gate. Replaces the old junk-only check —
 * we now use the strict 5-rule gate so anything that doesn't meet it is
 * excluded (and surfaced for cleanup).
 */
function isRemovable(c: DqClaim): boolean {
  return !inclusionCheck(c).included;
}

/**
 * Compute the average lag (days) between discharge and doc submission across
 * all rows that DO have both dates. Used for imputing missing submission dates
 * on settled rows — settled = valid by rule, so we estimate rather than flag.
 */
function avgSubmissionLagDays(claims: DqClaim[]): number | null {
  const samples: number[] = [];
  for (const c of claims) {
    const lag = dayDiff(c.date_of_discharge, c.doc_submission_date);
    if (lag !== null && lag >= 0 && lag < 365) samples.push(lag);
  }
  if (samples.length === 0) return null;
  return Math.round(samples.reduce((s, n) => s + n, 0) / samples.length);
}

// ---------- public API ------------------------------------------------------

/**
 * Score a SINGLE claim with all 4 layers (no cross-row duplicate detection).
 * Used when re-scoring a row that has already been imported.
 *
 * `cohortAvgSubmissionLag` (optional) — if provided and the claim is settled
 * with missing submission date, we IMPUTE rather than flag.
 */
export function scoreOne(
  c: DqClaim,
  rules: DqRules = DEFAULT_DQ_RULES,
  cohortAvgSubmissionLag?: number | null,
): DqResult {
  const rawBucket = bucketOfStatus(c.claim_status);
  const issues: DqIssue[] = [];

  // 🚪 Inclusion gate — fails any of the 5 rules → excluded (removable)
  const gate = inclusionCheck(c);
  if (!gate.included) {
    issues.push({
      layer: 2,
      severity: "warning",
      code: "L2_REMOVABLE",
      message: `Excluded: ${gate.reasons.join("; ")}`,
    });
    return {
      tag: "warning",
      issues,
      statusBucket: rawBucket,
      removable: true,
      included: false,
      exclusionReasons: gate.reasons,
      bucketOverridden: false,
    };
  }

  // 🎯 Approved-amount override (denied vs active)
  const { bucket, overridden } = applyApprovedAmountOverride(c, rawBucket);

  // Settled = valid by rule. Impute submission date if missing.
  let imputedSubmissionDate: string | null = null;
  const workingClaim: DqClaim = { ...c };
  if (
    bucket === "settled"
    && !c.doc_submission_date
    && c.date_of_discharge
    && cohortAvgSubmissionLag !== null
    && cohortAvgSubmissionLag !== undefined
  ) {
    imputedSubmissionDate = addDays(c.date_of_discharge, cohortAvgSubmissionLag);
    workingClaim.doc_submission_date = imputedSubmissionDate;
  }

  layer2(workingClaim, bucket, issues);
  layer3(workingClaim, bucket, rules, issues);
  layer4(workingClaim, bucket, rules, issues);

  // Hard rule: settled claims are always at-most "warning" (never error/critical)
  if (bucket === "settled") {
    for (const i of issues) {
      if (i.severity === "critical" || i.severity === "error") {
        i.severity = "warning";
      }
    }
  }

  return {
    tag: tagFromIssues(issues),
    issues,
    statusBucket: bucket,
    removable: false,
    imputedSubmissionDate,
    included: true,
    bucketOverridden: overridden,
  };
}

/**
 * Score MANY claims — runs per-row layers PLUS cross-row duplicate detection.
 * Returns one DqResult per input row, in the same order.
 *
 * Computes the cohort-average submission lag once and uses it to impute
 * missing doc-submission dates on settled rows.
 */
export function scoreMany(claims: DqClaim[], rules: DqRules = DEFAULT_DQ_RULES): DqResult[] {
  const cohortLag = avgSubmissionLagDays(claims);
  const perRowIssues: DqIssue[][] = claims.map(() => []);
  const perRowMeta: Array<
    Pick<DqResult, "statusBucket" | "removable" | "imputedSubmissionDate" | "included" | "exclusionReasons" | "bucketOverridden">
  > = claims.map(() => ({}));

  claims.forEach((c, i) => {
    const rawBucket = bucketOfStatus(c.claim_status);

    // 🚪 Inclusion gate
    const gate = inclusionCheck(c);
    if (!gate.included) {
      perRowIssues[i].push({
        layer: 2,
        severity: "warning",
        code: "L2_REMOVABLE",
        message: `Excluded: ${gate.reasons.join("; ")}`,
      });
      perRowMeta[i].statusBucket = rawBucket;
      perRowMeta[i].removable = true;
      perRowMeta[i].included = false;
      perRowMeta[i].exclusionReasons = gate.reasons;
      perRowMeta[i].bucketOverridden = false;
      return;
    }

    // 🎯 Approved-amount override (denied vs active)
    const { bucket, overridden } = applyApprovedAmountOverride(c, rawBucket);
    perRowMeta[i].statusBucket = bucket;
    perRowMeta[i].removable = false;
    perRowMeta[i].included = true;
    perRowMeta[i].bucketOverridden = overridden;

    let working: DqClaim = c;
    if (
      bucket === "settled"
      && !c.doc_submission_date
      && c.date_of_discharge
      && cohortLag !== null
    ) {
      const imputed = addDays(c.date_of_discharge, cohortLag);
      perRowMeta[i].imputedSubmissionDate = imputed;
      working = { ...c, doc_submission_date: imputed };
    }

    layer2(working, bucket, perRowIssues[i]);
    layer3(working, bucket, rules, perRowIssues[i]);
    layer4(working, bucket, rules, perRowIssues[i]);

    // Settled = always valid: downgrade error/critical → warning
    if (bucket === "settled") {
      for (const issue of perRowIssues[i]) {
        if (issue.severity === "critical" || issue.severity === "error") {
          issue.severity = "warning";
        }
      }
    }
  });

  layer3Duplicates(claims, perRowIssues);

  // 🚪 Duplicate claim numbers also fail the inclusion gate (per user spec).
  // Keep the FIRST occurrence as included; mark subsequent duplicates as removable/excluded.
  const seenClaimNo = new Set<string>();
  claims.forEach((c, i) => {
    if (!c.claim_number) return;
    const key = c.claim_number.trim().toUpperCase().replace(/\s+/g, "");
    if (!key) return;
    if (seenClaimNo.has(key)) {
      perRowMeta[i].removable = true;
      perRowMeta[i].included = false;
      perRowMeta[i].exclusionReasons = [
        ...(perRowMeta[i].exclusionReasons ?? []),
        "Duplicate claim number",
      ];
    } else {
      seenClaimNo.add(key);
    }
  });

  return perRowIssues.map((issues, i) => ({
    tag: tagFromIssues(issues),
    issues,
    statusBucket: perRowMeta[i].statusBucket,
    removable: perRowMeta[i].removable,
    imputedSubmissionDate: perRowMeta[i].imputedSubmissionDate ?? null,
    included: perRowMeta[i].included,
    exclusionReasons: perRowMeta[i].exclusionReasons,
    bucketOverridden: perRowMeta[i].bucketOverridden,
  }));
}

// ---------- aggregate summary -----------------------------------------------

export interface DqSummary {
  total: number;
  /** Rows passing the 5-rule inclusion gate (used everywhere downstream). */
  includedCount: number;
  /** Rows reclassified by approved-amount override (denied or active). */
  bucketOverriddenCount: number;
  byTag: Record<DqTag, number>;
  byLayer: Record<DqLayer, number>;
  byCode: Record<string, number>;
  byBucket: Record<StatusBucket, number>;
  removableCount: number;
  imputedCount: number;
  approvalRatePct: number | null;       // settled+approved / claimed
  denialRatePct: number | null;         // rejected/denied count / total
  avgTatDays: number | null;            // avg claim_creation → payment for closed
  ratioWarnings: string[];              // human-readable layer-4 ratio breaches
  cohortAvgSubmissionLagDays: number | null;
}

export function summarise(
  claims: DqClaim[],
  results: DqResult[],
  rules: DqRules = DEFAULT_DQ_RULES,
): DqSummary {
  const byTag: Record<DqTag, number> = { clean: 0, warning: 0, error: 0, critical: 0 };
  const byLayer: Record<DqLayer, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const byCode: Record<string, number> = {};
  const byBucket: Record<StatusBucket, number> = {
    settled: 0, submitted: 0, not_submitted: 0, under_process: 0,
    active_claim: 0, denial: 0, cashless_denied: 0, not_utilised: 0, unknown: 0,
  };
  let removableCount = 0;
  let imputedCount = 0;
  let includedCount = 0;
  let bucketOverriddenCount = 0;

  for (const r of results) {
    byTag[r.tag]++;
    if (r.statusBucket) byBucket[r.statusBucket]++;
    if (r.removable) removableCount++;
    if (r.imputedSubmissionDate) imputedCount++;
    if (r.included) includedCount++;
    if (r.bucketOverridden) bucketOverriddenCount++;
    for (const i of r.issues) {
      byLayer[i.layer]++;
      byCode[i.code] = (byCode[i.code] ?? 0) + 1;
    }
  }

  // Ratios — exclude removable rows from denominators for accuracy
  const validClaims = claims.filter((_, i) => !results[i]?.removable);
  const totalClaimedAmt = validClaims.reduce((s, c) => s + (c.claimed_amount ?? 0), 0);
  const totalApprovedAmt = validClaims.reduce((s, c) => s + (c.approved_amount ?? 0), 0);
  const denied = validClaims.filter((c) => {
    const b = bucketOfStatus(c.claim_status);
    return b === "denial" || b === "cashless_denied";
  }).length;
  const approvalRatePct = totalClaimedAmt > 0 ? (totalApprovedAmt / totalClaimedAmt) * 100 : null;
  const denialRatePct = validClaims.length > 0 ? (denied / validClaims.length) * 100 : null;

  // Avg TAT — closed claims only (claim creation → payment update)
  const tatSamples: number[] = [];
  for (const c of validClaims) {
    const tat = dayDiff(c.claim_creation_date, c.payment_update_date);
    if (tat !== null && tat >= 0) tatSamples.push(tat);
  }
  const avgTatDays = tatSamples.length > 0
    ? tatSamples.reduce((s, n) => s + n, 0) / tatSamples.length
    : null;

  const ratioWarnings: string[] = [];
  if (approvalRatePct !== null && approvalRatePct < rules.min_approval_rate_pct) {
    ratioWarnings.push(`Approval rate ${approvalRatePct.toFixed(1)}% (target ≥${rules.min_approval_rate_pct}%)`);
  }
  if (denialRatePct !== null && denialRatePct > rules.max_denial_rate_pct) {
    ratioWarnings.push(`Denial rate ${denialRatePct.toFixed(1)}% (max ${rules.max_denial_rate_pct}%)`);
  }
  if (avgTatDays !== null && avgTatDays > rules.max_avg_tat_days) {
    ratioWarnings.push(`Average TAT ${avgTatDays.toFixed(0)}d (max ${rules.max_avg_tat_days}d)`);
  }

  return {
    total: claims.length,
    includedCount,
    bucketOverriddenCount,
    byTag,
    byLayer,
    byCode,
    byBucket,
    removableCount,
    imputedCount,
    approvalRatePct,
    denialRatePct,
    avgTatDays,
    ratioWarnings,
    cohortAvgSubmissionLagDays: avgSubmissionLagDays(claims),
  };
}

// Friendly labels for issue codes (for tooltips / dashboards)
export const ISSUE_CODE_LABELS: Record<string, string> = {
  L2_CLAIM_NO_MISSING: "Claim number missing",
  L2_PATIENT_MISSING: "Patient missing",
  L2_ADMISSION_MISSING: "Admission missing",
  L2_CLAIMED_INVALID: "Claimed amount invalid",
  L2_STATUS_MISSING: "Status missing",
  L2_IP_NO_MISSING: "IP number missing",
  L2_DISCHARGE_MISSING: "Discharge missing",
  L2_TPA_MISSING: "TPA missing",
  L2_POLICY_MISSING: "Policy missing",
  L2_REMOVABLE: "Removable empty row",
  L3_NEG_CLAIMED: "Negative claimed",
  L3_NEG_APPROVED: "Negative approved",
  L3_NEG_SETTLED: "Negative settled",
  L3_APPROVED_GT_CLAIMED: "Approved > Claimed",
  L3_SETTLED_GT_APPROVED: "Settled > Approved",
  L3_DATE_DIS_BEFORE_ADM: "Discharge before admission",
  L3_DATE_CLAIM_BEFORE_DIS: "Claim date before discharge",
  L3_DATE_PAY_BEFORE_CLAIM: "Payment before claim date",
  L3_TAT_SUBMISSION: "Submission delay",
  L3_TAT_APPROVAL: "Approval delay",
  L3_TAT_SETTLEMENT: "Settlement delay",
  L3_ZERO_APPROVAL_RISK: "Zero-approval risk",
  L3_NO_SUBMISSION: "No submission logged",
  L3_PAID_NO_PAY_DATE: "Settled but no payment date",
  L3_NO_DISCHARGE: "No discharge after 30d",
  L3_DUP_CLAIM_NO: "Duplicate claim number",
  L3_DUP_PATIENT_DATE_AMT: "Duplicate by patient+date+amount",
  L3_PENDING_DOC_SUBMISSION: "Approved — pending doc submission",
  L4_HIGH_VALUE: "High-value outlier",
  L4_CLOSED_NO_SETTLE: "Settled but settled_amount=0",
  L4_DEPT_AMOUNT: "Department/amount anomaly",
};
