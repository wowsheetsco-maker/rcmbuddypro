/**
 * Short-payment appeal draft generator. Template-based (no external service).
 * Produces a ready-to-send letter that the user reviews before approval.
 */
import { computeDiscrepancy, type DiscrepancyClaim } from "./discrepancy";
import type { DqRules } from "./dataQualityEngine";

export interface AppealClaimInput extends DiscrepancyClaim {
  id: string;
  claim_number: string | null;
  patient_name: string | null;
  ihx_ref_id?: string | null;
  tpa_name?: string | null;
  insurance_company_name?: string | null;
  policy_number?: string | null;
  date_of_admission?: string | null;
  date_of_discharge?: string | null;
  cheque_neft_utr_no?: string | null;
  cheque_neft_utr_date?: string | null;
  hospital_name?: string | null;
}

export interface AppealDraft {
  subject: string;
  body: string;
  gap_amount: number;
  gap_pct: number;
  band: "low" | "medium" | "high" | null;
}

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const t = Date.parse(d);
  if (Number.isNaN(t)) return d;
  return new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildAppealDraft(
  claim: AppealClaimInput,
  rules: Pick<DqRules, "discrepancy_min_inr" | "discrepancy_min_pct" | "discrepancy_low_pct" | "discrepancy_high_pct">,
): AppealDraft | null {
  const d = computeDiscrepancy(claim, rules);
  if (!d.isDiscrepant) return null;

  const payer = claim.tpa_name || claim.insurance_company_name || "Payer";
  const subject = `Appeal — Short Payment on Claim ${claim.claim_number ?? claim.ihx_ref_id ?? ""} (${inr(d.amount)} gap)`;

  const lines: string[] = [];
  lines.push(`Dear ${payer} Claims Team,`);
  lines.push("");
  lines.push(
    `We write to formally appeal the short payment received against the claim referenced below. ` +
      `Based on the approval letter and the settlement advice, a shortfall of ${inr(d.amount)} ` +
      `(${d.pct.toFixed(1)}% of the approved amount) has been recorded against our books and requires reconciliation.`,
  );
  lines.push("");
  lines.push("Claim Details");
  lines.push("--------------");
  lines.push(`• Patient Name        : ${claim.patient_name ?? "—"}`);
  lines.push(`• Claim Number        : ${claim.claim_number ?? "—"}`);
  if (claim.ihx_ref_id) lines.push(`• IHX / Reference No  : ${claim.ihx_ref_id}`);
  if (claim.policy_number) lines.push(`• Policy Number       : ${claim.policy_number}`);
  if (claim.tpa_name) lines.push(`• TPA                 : ${claim.tpa_name}`);
  if (claim.insurance_company_name) lines.push(`• Insurer             : ${claim.insurance_company_name}`);
  lines.push(`• Date of Admission   : ${fmtDate(claim.date_of_admission)}`);
  lines.push(`• Date of Discharge   : ${fmtDate(claim.date_of_discharge)}`);
  if (claim.hospital_name) lines.push(`• Hospital            : ${claim.hospital_name}`);
  lines.push("");
  lines.push("Settlement Reconciliation");
  lines.push("--------------------------");
  lines.push(`• Approved Amount     : ${inr(Number(claim.approved_amount ?? 0))}`);
  lines.push(`• Settled Amount      : ${inr(Number(claim.settled_amount ?? 0))}`);
  lines.push(`• TDS Deducted        : ${inr(Number(claim.tds_amount ?? 0))}`);
  lines.push(`• Shortfall (Gap)     : ${inr(d.amount)} (${d.pct.toFixed(1)}%)`);
  if (claim.cheque_neft_utr_no) {
    lines.push(`• Payment UTR         : ${claim.cheque_neft_utr_no} dated ${fmtDate(claim.cheque_neft_utr_date)}`);
  }
  lines.push("");
  lines.push(
    `Request: Kindly review the above and release the balance amount of ${inr(d.amount)} at the earliest. ` +
      `If any specific deduction has been applied, please share a detailed deduction note so we can respond with supporting documents within ` +
      `7 working days.`,
  );
  lines.push("");
  lines.push("Supporting documents attached / available on request: Approval letter, Final bill, Discharge summary, Investigation reports.");
  lines.push("");
  lines.push("Thanks & regards,");
  lines.push(`${claim.hospital_name ?? "Hospital"} — Claims Recovery Desk`);

  return {
    subject,
    body: lines.join("\n"),
    gap_amount: d.amount,
    gap_pct: +d.pct.toFixed(2),
    band: d.band,
  };
}
