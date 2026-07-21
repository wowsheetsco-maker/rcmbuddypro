/**
 * Leakage detectors — every ₹ the hospital has already earned but is at risk
 * of losing. Pure functions over a Claim[] so both the Leakage Dashboard and
 * downstream exports share one source of truth.
 */
import type { Claim } from "@/data/mockClaims";
import { isSettled, isDenied, isSubmitted, isDocsToSubmit } from "@/lib/claimStatusBuckets";

export type LeakageId =
  | "short_pay"
  | "tds_excess"
  | "missing_utr"
  | "zero_approved_discharged"
  | "denied_no_appeal"
  | "docs_not_submitted"
  | "stale_processing";

export interface LeakageRow {
  id: string;              // claim id (or synthetic)
  claimNumber: string;
  patient: string;
  payer: string;
  amount: number;          // ₹ at risk for this row
  ageDays: number;
  detail: string;
}

export interface LeakageBucket {
  id: LeakageId;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  claims: number;
  amount: number;
  rows: LeakageRow[];
}

const daysSince = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
};

const pushRow = (b: LeakageBucket, c: Claim, amount: number, detail: string) => {
  b.claims += 1;
  b.amount += amount;
  b.rows.push({
    id: c.id,
    claimNumber: c.claim_number,
    patient: c.patient_name,
    payer: c.insurance_company_name || c.tpa_name || "Unknown",
    amount,
    ageDays: daysSince(c.claim_creation_date),
    detail,
  });
};

export function detectLeakage(claims: Claim[]): LeakageBucket[] {
  const buckets: Record<LeakageId, LeakageBucket> = {
    short_pay: { id: "short_pay", title: "Short-payment on approved claims", description: "Approved − Settled − TDS is > ₹100 on a settled claim.", severity: "high", claims: 0, amount: 0, rows: [] },
    tds_excess: { id: "tds_excess", title: "TDS exceeds statutory 2%", description: "TDS booked > 2% of approved value — recoverable via Form 26AS.", severity: "medium", claims: 0, amount: 0, rows: [] },
    missing_utr: { id: "missing_utr", title: "Settled but UTR missing", description: "Status is settled but cheque / NEFT / UTR reference is blank — bank recon impossible.", severity: "medium", claims: 0, amount: 0, rows: [] },
    zero_approved_discharged: { id: "zero_approved_discharged", title: "Discharged with zero approval", description: "Patient discharged, claim submitted, approved amount is ₹0 — needs escalation.", severity: "high", claims: 0, amount: 0, rows: [] },
    denied_no_appeal: { id: "denied_no_appeal", title: "Denied without appeal in 30d", description: "Claim denied > 30 days ago and no appeal has been filed.", severity: "high", claims: 0, amount: 0, rows: [] },
    docs_not_submitted: { id: "docs_not_submitted", title: "Approved but docs not submitted > 7d", description: "Pre-auth / discharge approved and patient discharged but claim not yet submitted.", severity: "medium", claims: 0, amount: 0, rows: [] },
    stale_processing: { id: "stale_processing", title: "Stuck in processing > 45d", description: "Claim submitted > 45 days ago and still in processing / query — SLA breach.", severity: "medium", claims: 0, amount: 0, rows: [] },
  };

  for (const c of claims) {
    const approved = Number(c.approved_amount || 0);
    const settled = Number(c.settled_amount || 0);
    const tds = Number(c.tds_amount || 0);

    // Short-payment on settled claims (≥ ₹100 gap so we ignore rounding)
    if (isSettled(c) && approved > 0) {
      const gap = approved - settled - tds;
      if (gap >= 100) pushRow(buckets.short_pay, c, gap, `Approved ₹${approved.toLocaleString("en-IN")} − Settled ₹${settled.toLocaleString("en-IN")} − TDS ₹${tds.toLocaleString("en-IN")}`);
    }

    // TDS excess
    if (approved > 0 && tds > approved * 0.02 + 1) {
      const excess = tds - approved * 0.02;
      pushRow(buckets.tds_excess, c, excess, `TDS ₹${tds.toLocaleString("en-IN")} vs 2% cap ₹${(approved * 0.02).toFixed(0)}`);
    }

    // Missing UTR on settled
    if (isSettled(c) && !c.cheque_neft_utr_no) {
      pushRow(buckets.missing_utr, c, settled || approved, "No UTR / cheque reference recorded");
    }

    // Zero-approved but discharged
    if (c.date_of_discharge && approved === 0 && !isDenied(c) && isSubmitted(c)) {
      pushRow(buckets.zero_approved_discharged, c, Number(c.claimed_amount || 0), `Claimed ₹${Number(c.claimed_amount || 0).toLocaleString("en-IN")} — approved ₹0`);
    }

    // Denied without appeal (30d proxy: claim_creation_date age)
    if (isDenied(c)) {
      const age = daysSince(c.payment_update_date || c.last_communication_at || c.claim_creation_date);
      if (age > 30) pushRow(buckets.denied_no_appeal, c, Number(c.claimed_amount || approved || 0), `Denied ${age}d ago`);
    }

    // Docs to submit older than 7d
    if (isDocsToSubmit(c)) {
      const age = daysSince(c.date_of_discharge);
      if (age > 7) pushRow(buckets.docs_not_submitted, c, approved || Number(c.claimed_amount || 0), `Discharged ${age}d ago`);
    }

    // Stuck in processing > 45d
    const status = (c.claim_status || "").toLowerCase();
    if ((status.includes("processing") || status.includes("progress") || status.includes("query")) && !isSettled(c) && !isDenied(c)) {
      const age = daysSince(c.doc_submission_date || c.claim_creation_date);
      if (age > 45) pushRow(buckets.stale_processing, c, approved || Number(c.claimed_amount || 0), `${age}d without resolution`);
    }
  }

  return Object.values(buckets).sort((a, b) => b.amount - a.amount);
}

export function totalLeakage(buckets: LeakageBucket[]): { claims: number; amount: number } {
  // Amount total is bucket-sum: a single claim may appear in multiple buckets
  // for different failure modes — this is intentional so each detector shows
  // its true addressable value.
  let claims = 0, amount = 0;
  for (const b of buckets) { claims += b.claims; amount += b.amount; }
  return { claims, amount };
}
