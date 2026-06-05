/**
 * Build a handoff packet for a collections agency.
 * Pure JSON snapshot — no PHI is leaked beyond what is strictly needed
 * for the agency to chase a single claim.
 */
import type { Claim } from "@/data/mockClaims";

export interface HandoffPacket {
  generated_at: string;
  hospital: {
    name: string | null;
    branch: string | null;
  };
  claim: {
    claim_number: string;
    creation_date: string | null;
    admission_date: string | null;
    discharge_date: string | null;
    status: string | null;
    days_outstanding: number | null;
  };
  patient: {
    name: string;
    uhid: string | null;
  };
  payer: {
    tpa: string | null;
    insurer: string | null;
    policy_number: string | null;
  };
  financials: {
    claimed: number;
    approved: number;
    settled: number;
    tds: number;
    outstanding: number;
  };
  references: {
    ihx_ref_id: string | null;
    utr_no: string | null;
    utr_date: string | null;
  };
  attachments_checklist: string[];
  notes: string;
}

export function buildHandoffPacket(claim: Claim, notes = ""): HandoffPacket {
  return {
    generated_at: new Date().toISOString(),
    hospital: {
      name: claim.hospital_name ?? null,
      branch: (claim as unknown as { hospital_branch_name?: string }).hospital_branch_name ?? null,
    },
    claim: {
      claim_number: claim.claim_number,
      creation_date: claim.claim_creation_date ?? null,
      admission_date: claim.date_of_admission ?? null,
      discharge_date: claim.date_of_discharge ?? null,
      status: claim.claim_status ?? null,
      days_outstanding: claim.days_since_claim ?? null,
    },
    patient: {
      name: claim.patient_name,
      uhid: (claim as unknown as { uhid?: string }).uhid ?? null,
    },
    payer: {
      tpa: claim.tpa_name ?? null,
      insurer: claim.insurance_company_name ?? null,
      policy_number: claim.policy_number ?? null,
    },
    financials: {
      claimed: Number(claim.claimed_amount ?? 0),
      approved: Number(claim.approved_amount ?? 0),
      settled: Number(claim.settled_amount ?? 0),
      tds: Number(claim.tds_amount ?? 0),
      outstanding: Number(claim.outstanding_amount ?? 0),
    },
    references: {
      ihx_ref_id: claim.ihx_ref_id ?? null,
      utr_no: claim.cheque_neft_utr_no ?? null,
      utr_date: claim.cheque_neft_utr_date ?? null,
    },
    attachments_checklist: [
      "Final hospital bill",
      "Discharge summary",
      "Claim form (signed)",
      "TPA acknowledgement",
      "All correspondence with TPA/insurer",
      "Last reminder/notice sent",
    ],
    notes,
  };
}

export function packetToText(p: HandoffPacket): string {
  const inr = (n: number) => `INR ${Math.round(n).toLocaleString("en-IN")}`;
  return [
    `COLLECTIONS HANDOFF PACKET`,
    `Generated: ${new Date(p.generated_at).toLocaleString("en-IN")}`,
    ``,
    `HOSPITAL: ${p.hospital.name ?? "—"}${p.hospital.branch ? ` · ${p.hospital.branch}` : ""}`,
    ``,
    `--- CLAIM ---`,
    `Claim No:      ${p.claim.claim_number}`,
    `Status:        ${p.claim.status ?? "—"}`,
    `Creation:      ${p.claim.creation_date ?? "—"}`,
    `Admission:     ${p.claim.admission_date ?? "—"}`,
    `Discharge:     ${p.claim.discharge_date ?? "—"}`,
    `Days open:     ${p.claim.days_outstanding ?? "—"}`,
    ``,
    `--- PATIENT ---`,
    `Name:          ${p.patient.name}`,
    `UHID:          ${p.patient.uhid ?? "—"}`,
    ``,
    `--- PAYER ---`,
    `TPA:           ${p.payer.tpa ?? "—"}`,
    `Insurer:       ${p.payer.insurer ?? "—"}`,
    `Policy No:     ${p.payer.policy_number ?? "—"}`,
    ``,
    `--- FINANCIALS ---`,
    `Claimed:       ${inr(p.financials.claimed)}`,
    `Approved:      ${inr(p.financials.approved)}`,
    `Settled:       ${inr(p.financials.settled)}`,
    `TDS:           ${inr(p.financials.tds)}`,
    `OUTSTANDING:   ${inr(p.financials.outstanding)}`,
    ``,
    `--- REFERENCES ---`,
    `IHX Ref:       ${p.references.ihx_ref_id ?? "—"}`,
    `UTR No:        ${p.references.utr_no ?? "—"}`,
    `UTR Date:      ${p.references.utr_date ?? "—"}`,
    ``,
    `--- ATTACHMENTS TO INCLUDE ---`,
    ...p.attachments_checklist.map((a) => `  □ ${a}`),
    ``,
    `--- NOTES ---`,
    p.notes || "(none)",
  ].join("\n");
}

export function downloadPacket(packet: HandoffPacket, claimNumber: string) {
  const txt = packetToText(packet);
  const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `collections-handoff-${claimNumber}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
