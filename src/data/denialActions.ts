/**
 * Corrective action templates (CARC/RARC equivalent for Indian health insurance).
 *
 * For each standardized denial code we capture:
 *   - root_cause      : 1-line plain-English root cause
 *   - corrective      : ordered steps the team should take NOW to recover this claim
 *   - prevention      : how to stop this denial from happening again (feeds scrubber)
 *   - scrubber_rule   : machine-checkable rule key the dq engine can enforce
 *   - appeal_angle    : the strongest argument to lead the appeal letter with
 *   - escalation_to   : the role to escalate to if not resolved within SLA
 */
import type { DenialCode } from "./denialCodes";

export type EscalationRole =
  | "Billing Executive"
  | "Billing TL"
  | "Insurance Manager"
  | "Hospital CXO"
  | "Patient Counsellor";

export interface DenialAction {
  code: string;
  root_cause: string;
  corrective: string[];
  prevention: string[];
  scrubber_rule?: string;
  appeal_angle: string;
  escalation_to: EscalationRole;
}

export const DENIAL_ACTIONS: Record<string, DenialAction> = {
  "MN-01": {
    code: "MN-01",
    root_cause: "Insurer's medical panel views the treatment as avoidable / day-care eligible.",
    corrective: [
      "Pull treating doctor's clinical justification note + ICU/HDU vitals chart",
      "Attach peer-reviewed reference or institutional protocol for the procedure",
      "Request a re-review by the panel doctor with named credentials",
    ],
    prevention: [
      "Mandate pre-auth note to quote ICD-10 + procedure + clinical justification",
      "Add medical-necessity dropdown in admission form",
    ],
    scrubber_rule: "require_clinical_justification_on_preauth",
    appeal_angle: "Clinical necessity established by treating consultant + institutional protocol.",
    escalation_to: "Insurance Manager",
  },
  "MN-02": {
    code: "MN-02",
    root_cause: "Procedure could have been done as day-care but was billed as IPD.",
    corrective: [
      "Justify overnight observation requirement (anaesthesia recovery / post-op vitals)",
      "Re-bill as day-care if medically defensible — recovery is faster than appeal",
    ],
    prevention: ["Add day-care procedure list check at admission"],
    scrubber_rule: "check_daycare_procedure_list",
    appeal_angle: "Overnight observation was clinically required; not a discretionary admission.",
    escalation_to: "Billing TL",
  },
  "MN-03": {
    code: "MN-03",
    root_cause: "Length of stay exceeds insurer's expected band for the DRG / procedure.",
    corrective: [
      "Provide daily clinical notes documenting each additional day's necessity",
      "Highlight any complication, infection, or co-morbidity that extended stay",
    ],
    prevention: ["Daily LOS review by case manager from day-3 onward"],
    appeal_angle: "Documented clinical complication justifying extended length of stay.",
    escalation_to: "Insurance Manager",
  },
  "PC-01": {
    code: "PC-01",
    root_cause: "Diagnosis / procedure listed under policy exclusions.",
    corrective: [
      "Re-read exact policy wording — many exclusions have carve-outs",
      "If exclusion is firm, convert to reimbursement and counsel patient",
    ],
    prevention: ["Verify exclusion list at pre-auth — flag in patient counselling"],
    appeal_angle: "Treatment falls outside the literal exclusion clause (cite policy section).",
    escalation_to: "Patient Counsellor",
  },
  "PC-02": {
    code: "PC-02",
    root_cause: "Initial / specific waiting period not yet elapsed.",
    corrective: [
      "Confirm policy inception date vs admission date",
      "Counsel patient that this is non-recoverable — collect from patient",
    ],
    prevention: ["Waiting-period check at pre-auth (policy inception + months elapsed)"],
    scrubber_rule: "waiting_period_check_at_preauth",
    appeal_angle: "Generally non-appealable; only contest if waiting period miscalculated.",
    escalation_to: "Patient Counsellor",
  },
  "PC-03": {
    code: "PC-03",
    root_cause: "Policy was inactive on the date of admission.",
    corrective: ["Convert to self-pay immediately; counsel patient"],
    prevention: ["Mandatory policy-validity verification at admission"],
    appeal_angle: "Non-appealable unless renewal grace period was active.",
    escalation_to: "Patient Counsellor",
  },
  "DOC-01": {
    code: "DOC-01",
    root_cause: "Discharge summary not provided or missing required fields.",
    corrective: [
      "Re-issue full discharge summary signed by treating doctor",
      "Upload to portal + courier hard-copy with POD",
    ],
    prevention: [
      "Discharge summary mandatory before claim submission",
      "Auto-block submission if doc missing",
    ],
    scrubber_rule: "block_submission_without_discharge_summary",
    appeal_angle: "Document is attached; please reprocess and release approval.",
    escalation_to: "Billing Executive",
  },
  "DOC-02": {
    code: "DOC-02",
    root_cause: "Investigation reports requested by insurer were not submitted.",
    corrective: ["Collate all lab / imaging reports and resubmit within 48 hrs"],
    prevention: ["Auto-attach investigation bundle from HIS to every claim"],
    scrubber_rule: "require_investigation_bundle",
    appeal_angle: "All requested reports are now enclosed; kindly reprocess.",
    escalation_to: "Billing Executive",
  },
  "DOC-03": {
    code: "DOC-03",
    root_cause: "Indoor case papers / nursing notes were not shared.",
    corrective: ["Photocopy + index ICP day-wise and resubmit"],
    prevention: ["ICP scanning at discharge becomes part of file closure"],
    scrubber_rule: "require_indoor_case_papers",
    appeal_angle: "Complete ICP enclosed for the entire admission period.",
    escalation_to: "Billing Executive",
  },
  "DOC-04": {
    code: "DOC-04",
    root_cause: "KYC / ID proof mismatch between policy and admission record.",
    corrective: [
      "Reconcile name / DOB across Aadhaar, policy, and HIS record",
      "Submit affidavit if minor spelling variation",
    ],
    prevention: ["KYC double-check at registration desk"],
    scrubber_rule: "kyc_match_on_registration",
    appeal_angle: "Identity established by Aadhaar + policy + admission record (enclosed).",
    escalation_to: "Billing Executive",
  },
  "TR-01": {
    code: "TR-01",
    root_cause: "Room rent exceeds policy sub-limit → proportionate deduction applied.",
    corrective: [
      "Recompute proportionate deduction; challenge if applied to non-rent items",
      "Quote insurer circulars / IRDAI guidance restricting proportionate cut to associated medical expenses only",
    ],
    prevention: [
      "Room-eligibility check at admission",
      "Counsel patient to upgrade room only with consent",
    ],
    scrubber_rule: "room_eligibility_check_at_admission",
    appeal_angle: "Proportionate deduction applied beyond permissible scope; IRDAI circular cited.",
    escalation_to: "Insurance Manager",
  },
  "TR-02": {
    code: "TR-02",
    root_cause: "Non-payable consumables / admin charges deducted as per IRDAI list.",
    corrective: ["Mostly non-recoverable; bill patient or absorb as discount"],
    prevention: ["Tag non-payables in HIS and exclude from claim line items"],
    appeal_angle: "Limited scope — only appeal if item was clinically essential.",
    escalation_to: "Billing TL",
  },
  "TR-03": {
    code: "TR-03",
    root_cause: "Hospital tariff above the agreed PPN / network rate.",
    corrective: [
      "Reference the empanelment tariff schedule and re-bill at PPN rates",
      "If specialty procedure not in tariff, request rate-negotiation by Insurance Manager",
    ],
    prevention: ["Auto-apply PPN tariff at billing if patient is on that network"],
    scrubber_rule: "apply_ppn_tariff",
    appeal_angle: "Rate aligns with current empanelment schedule (enclosed).",
    escalation_to: "Insurance Manager",
  },
  "TR-04": {
    code: "TR-04",
    root_cause: "Procedure-specific sub-limit (e.g. cataract, joint replacement) has been exhausted.",
    corrective: ["Collect balance from patient; non-recoverable from insurer"],
    prevention: ["Counsel patient about sub-limit at pre-auth"],
    appeal_angle: "Non-appealable; recover from patient.",
    escalation_to: "Patient Counsellor",
  },
  "PED-01": {
    code: "PED-01",
    root_cause: "Insurer claims non-disclosure of pre-existing condition at policy inception.",
    corrective: [
      "Obtain doctor's certificate confirming first diagnosis date",
      "Show OPD history if condition surfaced after policy inception",
    ],
    prevention: ["Capture detailed history at admission for chronic conditions"],
    appeal_angle: "First-diagnosis evidence post-policy-inception attached.",
    escalation_to: "Insurance Manager",
  },
  "PED-02": {
    code: "PED-02",
    root_cause: "PED waiting period (usually 2-4 years) not completed.",
    corrective: ["Generally non-appealable; counsel patient"],
    prevention: ["PED waiting-period check at pre-auth"],
    scrubber_rule: "ped_waiting_check",
    appeal_angle: "Non-appealable unless waiting period miscalculated.",
    escalation_to: "Patient Counsellor",
  },
  "PR-01": {
    code: "PR-01",
    root_cause: "Pre-authorization was not raised before admission (planned) or within 24 hrs (emergency).",
    corrective: [
      "File delayed pre-auth with emergency justification + ER admission notes",
      "Request waiver citing clinical urgency",
    ],
    prevention: [
      "Pre-auth desk mandatory acknowledgement before admission",
      "24-hr emergency pre-auth SLA alarm",
    ],
    scrubber_rule: "preauth_filed_before_admission_or_24h",
    appeal_angle: "Clinical emergency precluded timely pre-auth; ER record enclosed.",
    escalation_to: "Insurance Manager",
  },
  "PR-02": {
    code: "PR-02",
    root_cause: "Final claim filed after the insurer's TAT (commonly 7-15 days from discharge).",
    corrective: ["Submit immediately with delay-reason letter signed by Insurance Manager"],
    prevention: ["7-day submission SLA tracked on Submission Tracker"],
    scrubber_rule: "submit_within_7_days_of_discharge",
    appeal_angle: "Delay was procedural; clinical merit of claim is unaffected.",
    escalation_to: "Billing TL",
  },
  "PR-03": {
    code: "PR-03",
    root_cause: "Cashless denied at admission; insurer expects reimbursement filing.",
    corrective: [
      "Convert to reimbursement track; collect estimate from patient",
      "Submit reimbursement bundle within 30 days of discharge",
    ],
    prevention: ["Pre-auth desk to confirm cashless approval before admission"],
    appeal_angle: "Reimbursement claim filed with all required documents; please process.",
    escalation_to: "Patient Counsellor",
  },
};

export function getActionForCode(code: DenialCode | undefined | null): DenialAction | null {
  if (!code) return null;
  return DENIAL_ACTIONS[code.code] ?? null;
}
