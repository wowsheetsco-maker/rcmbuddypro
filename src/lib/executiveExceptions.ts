/**
 * Executive Exceptions — a feed of "things that shouldn't exist in a well-run
 * RCM operation." Different from KPIs: these are individual anomalies that a
 * CFO / RCM head can act on today.
 */
import type { Claim } from "@/data/mockClaims";
import { isSettled, isSubmitted, isDenied, isDocsToSubmit } from "@/lib/claimStatusBuckets";

export type ExceptionId =
  | "approved_not_submitted"
  | "settled_no_payment_date"
  | "denied_no_action"
  | "discharged_no_claim"
  | "submitted_no_status"
  | "over_paid";

export interface ExceptionRow {
  id: string;
  claimNumber: string;
  patient: string;
  payer: string;
  ageDays: number;
  amount: number;
  detail: string;
}

export interface ExceptionBucket {
  id: ExceptionId;
  title: string;
  description: string;
  severity: "high" | "medium" | "low";
  rows: ExceptionRow[];
}

const daysSince = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
};

export function detectExceptions(claims: Claim[]): ExceptionBucket[] {
  const buckets: Record<ExceptionId, ExceptionBucket> = {
    approved_not_submitted: { id: "approved_not_submitted", title: "Approved but not submitted > 7d", description: "Pre-auth/discharge approved, patient discharged, but no submission on file.", severity: "high", rows: [] },
    settled_no_payment_date: { id: "settled_no_payment_date", title: "Settled without payment_update_date", description: "Status is settled but the actual payment date is missing — impossible to reconcile.", severity: "medium", rows: [] },
    denied_no_action: { id: "denied_no_action", title: "Denied with no follow-up in 14d", description: "Claim denied and no communication note recorded in the last two weeks.", severity: "high", rows: [] },
    discharged_no_claim: { id: "discharged_no_claim", title: "Discharged but claim never created", description: "Discharge date set, but claim_status is blank / awaiting submission.", severity: "high", rows: [] },
    submitted_no_status: { id: "submitted_no_status", title: "Submitted > 60d with no status change", description: "Submitted claims that have been silent for over 60 days — escalate to payer.", severity: "medium", rows: [] },
    over_paid: { id: "over_paid", title: "Over-payment detected", description: "Settled amount exceeds approved amount by more than ₹100 — refund liability or credit note.", severity: "low", rows: [] },
  };

  for (const c of claims) {
    const approved = Number(c.approved_amount || 0);
    const settled = Number(c.settled_amount || 0);
    const status = (c.claim_status || "").toLowerCase().trim();

    if (isDocsToSubmit(c) && daysSince(c.date_of_discharge) > 7) {
      buckets.approved_not_submitted.rows.push({
        id: c.id, claimNumber: c.claim_number, patient: c.patient_name,
        payer: c.insurance_company_name || c.tpa_name || "Unknown",
        ageDays: daysSince(c.date_of_discharge), amount: approved,
        detail: `Discharged ${daysSince(c.date_of_discharge)}d ago`,
      });
    }

    if (isSettled(c) && !c.payment_update_date) {
      buckets.settled_no_payment_date.rows.push({
        id: c.id, claimNumber: c.claim_number, patient: c.patient_name,
        payer: c.insurance_company_name || c.tpa_name || "Unknown",
        ageDays: daysSince(c.claim_creation_date), amount: settled,
        detail: "payment_update_date is null",
      });
    }

    if (isDenied(c)) {
      const commAge = daysSince(c.last_communication_at || c.payment_update_date || c.claim_creation_date);
      if (commAge > 14) {
        buckets.denied_no_action.rows.push({
          id: c.id, claimNumber: c.claim_number, patient: c.patient_name,
          payer: c.insurance_company_name || c.tpa_name || "Unknown",
          ageDays: commAge, amount: Number(c.claimed_amount || approved || 0),
          detail: `No note for ${commAge}d`,
        });
      }
    }

    if (c.date_of_discharge && (!status || status === "-" || status === "not submitted")) {
      buckets.discharged_no_claim.rows.push({
        id: c.id, claimNumber: c.claim_number, patient: c.patient_name,
        payer: c.insurance_company_name || c.tpa_name || "Unknown",
        ageDays: daysSince(c.date_of_discharge), amount: Number(c.claimed_amount || 0),
        detail: `Discharged ${daysSince(c.date_of_discharge)}d ago, no claim status`,
      });
    }

    if (isSubmitted(c) && !isSettled(c) && !isDenied(c)) {
      const age = daysSince(c.doc_submission_date || c.claim_creation_date);
      if (age > 60) {
        buckets.submitted_no_status.rows.push({
          id: c.id, claimNumber: c.claim_number, patient: c.patient_name,
          payer: c.insurance_company_name || c.tpa_name || "Unknown",
          ageDays: age, amount: approved || Number(c.claimed_amount || 0),
          detail: `No status change in ${age}d`,
        });
      }
    }

    if (isSettled(c) && settled > approved + 100 && approved > 0) {
      buckets.over_paid.rows.push({
        id: c.id, claimNumber: c.claim_number, patient: c.patient_name,
        payer: c.insurance_company_name || c.tpa_name || "Unknown",
        ageDays: daysSince(c.payment_update_date || c.claim_creation_date),
        amount: settled - approved,
        detail: `Settled ₹${settled.toLocaleString("en-IN")} vs approved ₹${approved.toLocaleString("en-IN")}`,
      });
    }
  }

  // Sort rows inside each bucket by age desc for actionability.
  for (const b of Object.values(buckets)) {
    b.rows.sort((a, b) => b.ageDays - a.ageDays);
  }
  return Object.values(buckets).sort((a, b) => b.rows.length - a.rows.length);
}
