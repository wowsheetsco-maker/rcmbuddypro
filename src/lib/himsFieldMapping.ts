// HIMS field-mapping helpers: presets for common Indian HIMS exports,
// fuzzy auto-detection of columns, and a "data readiness score" that tells
// hospitals which analytics features are unlocked by their current mapping.
//
// The wizard reads a CSV/XLSX file, offers a mapping UI keyed off these
// helpers, and passes the resulting override map back to `parseClaimsFile`.

import { HEADER_MAP, type ClaimUpsertRow } from "./claimsImport";

/** Reconstruct the effective header→field mapping after applying overrides on top of the built-in HEADER_MAP. */
export function effectiveMapping(
  detectedHeaders: string[],
  override?: Record<string, keyof ClaimUpsertRow>,
): Record<string, keyof ClaimUpsertRow> {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const overrideNorm: Record<string, keyof ClaimUpsertRow> = {};
  for (const [k, v] of Object.entries(override ?? {})) overrideNorm[norm(k)] = v;
  const out: Record<string, keyof ClaimUpsertRow> = {};
  for (const h of detectedHeaders) {
    const o = overrideNorm[norm(h)];
    if (o) { out[h] = o; continue; }
    const b = HEADER_MAP[norm(h)];
    if (b && b !== "_skip") out[h] = b;
  }
  return out;
}

export type ClaimField = keyof ClaimUpsertRow | "_skip";

/** All mappable target fields, in the order the wizard shows them. */
export const MAPPABLE_FIELDS: { field: keyof ClaimUpsertRow; label: string; required?: boolean }[] = [
  { field: "claim_number", label: "Claim Number", required: true },
  { field: "patient_name", label: "Patient Name", required: true },
  { field: "tpa_name", label: "TPA Name", required: true },
  { field: "claim_status", label: "Claim Status", required: true },
  { field: "claim_creation_date", label: "Claim Creation Date", required: true },
  { field: "insurance_company_name", label: "Insurance Company" },
  { field: "policy_number", label: "Policy Number" },
  { field: "policy_type", label: "Policy Type" },
  { field: "policy_holder_name", label: "Policy Holder" },
  { field: "employee_code", label: "Employee Code" },
  { field: "member_customer_id", label: "Member / Customer ID" },
  { field: "in_patient_number", label: "IP / UHID Number" },
  { field: "hospital_name", label: "Hospital / Branch" },
  { field: "date_of_admission", label: "Admission Date" },
  { field: "date_of_discharge", label: "Discharge Date" },
  { field: "doc_submission_date", label: "Document Submission Date" },
  { field: "payment_update_date", label: "Payment Update Date" },
  { field: "claimed_amount", label: "Claimed Amount" },
  { field: "approved_amount", label: "Approved Amount" },
  { field: "settled_amount", label: "Settled Amount" },
  { field: "tds_amount", label: "TDS Amount" },
  { field: "copay", label: "Co-pay" },
  { field: "shortfall_amount", label: "Shortfall Amount" },
  { field: "hospital_discount", label: "Hospital Discount" },
  { field: "patient_paid_amount", label: "Patient Paid" },
  { field: "cheque_neft_utr_no", label: "UTR / Cheque No." },
  { field: "cheque_neft_utr_date", label: "UTR / Cheque Date" },
  { field: "receipt_no", label: "Receipt No." },
  { field: "treatment", label: "Treatment" },
  { field: "diagnosis", label: "Diagnosis" },
  { field: "insurer_comments", label: "Insurer Comments / Denial Reason" },
  { field: "treating_doctor", label: "Treating Doctor" },
  { field: "ward", label: "Ward / Room Type" },
  { field: "coder_name", label: "Medical Coder" },
  { field: "tpa_spoc", label: "TPA SPOC (email/phone)" },
  { field: "hospital_spoc", label: "Hospital Insurance SPOC" },
  { field: "remarks", label: "Remarks / Notes" },
  { field: "initial_claim_number", label: "Initial / Pre-auth Claim No." },
  { field: "ihx_ref_id", label: "IHX / Portal Ref ID" },
  { field: "patient_contact", label: "Patient Contact" },
];

/** Regex tokens per DB field for fuzzy auto-detection from arbitrary HIMS headers. */
const FIELD_TOKENS: Record<keyof ClaimUpsertRow, RegExp[]> = {
  claim_number: [/^claim\s*(no|number|id|ref)$/, /^claim\s*num/i],
  patient_name: [/^patient(\s*name)?$/i, /^pt\.?\s*name$/i, /^name\s*of\s*patient$/i],
  tpa_name: [/tpa/i],
  claim_status: [/^status$/i, /claim\s*status/i, /current\s*status/i],
  claim_creation_date: [/claim\s*(creation|date|registration|logged)/i, /billing\s*date/i, /submission\s*date/i],
  insurance_company_name: [/insur(er|ance)/i, /payer\s*name/i, /company\s*name/i],
  policy_number: [/policy\s*(no|number)/i],
  policy_type: [/policy\s*type/i, /base.*top.*up/i],
  policy_holder_name: [/policy\s*holder/i, /proposer/i],
  employee_code: [/emp(loyee)?\s*(code|id|no)/i],
  member_customer_id: [/member\s*id/i, /customer\s*id/i, /card\s*no/i],
  in_patient_number: [/ip\s*(no|number)/i, /uhid/i, /admission\s*no/i, /mr\s*no/i],
  hospital_name: [/hospital(\s*name)?/i, /branch/i, /facility/i, /unit\s*name/i],
  date_of_admission: [/admission\s*date/i, /doa/i, /date\s*of\s*adm/i],
  date_of_discharge: [/discharge\s*date/i, /dod/i, /date\s*of\s*dis/i],
  doc_submission_date: [/doc.*submission/i, /file\s*sub/i, /dispatch\s*date/i, /courier\s*date/i],
  payment_update_date: [/payment\s*(update|date|received)/i, /settlement\s*date/i, /credited/i],
  claimed_amount: [/claim(ed)?\s*(amt|amount|value)/i, /bill\s*amount/i, /gross\s*amount/i],
  approved_amount: [/approved\s*(amt|amount)/i, /sanctioned/i],
  settled_amount: [/settled\s*(amt|amount)/i, /paid\s*amount/i, /net\s*paid/i],
  tds_amount: [/tds/i],
  copay: [/co[\s\-_]*pay/i],
  shortfall_amount: [/short\s*fall/i, /shortfall/i, /deduction/i, /disallow/i],
  hospital_discount: [/hosp.*discount/i, /discount/i],
  patient_paid_amount: [/patient\s*paid/i, /oop/i, /out\s*of\s*pocket/i],
  cheque_neft_utr_no: [/utr/i, /neft/i, /cheque.*no/i, /transaction\s*id/i],
  cheque_neft_utr_date: [/utr.*date/i, /neft.*date/i, /cheque.*date/i],
  receipt_no: [/receipt/i],
  treatment: [/treatment/i, /procedure/i],
  diagnosis: [/diagnosis/i, /icd/i],
  insurer_comments: [/insurer.*(comment|reason|remark)/i, /denial\s*reason/i, /reject.*reason/i, /query/i],
  treating_doctor: [/doctor/i, /consultant/i, /surgeon/i, /physician/i],
  ward: [/^ward/i, /room\s*type/i, /room\s*category/i, /bed\s*category/i],
  coder_name: [/coder/i, /coding\s*(by|user)/i],
  tpa_spoc: [/tpa.*(spoc|contact|email|phone)/i, /desk\s*doctor/i],
  hospital_spoc: [/hospital.*(spoc|coord)/i, /insurance\s*(coord|desk)/i, /(i|ip)\s*desk/i],
  remarks: [/remark/i, /notes?$/i, /comments?$/i],
  initial_claim_number: [/(initial|pre[\s\-]?auth).*claim/i, /^pre[\s\-]?auth$/i],
  ihx_ref_id: [/ihx/i, /portal\s*ref/i],
  patient_contact: [/patient.*(contact|mobile|phone)/i, /mobile\s*no/i],
  // fields the wizard doesn't offer directly
  outstanding_amount: [],
  is_irdai_breach: [],
  hospital_group_id: [],
  hospital_branch_id: [],
};

/** Preset mappings for common Indian HIMS. Keys are (lowercased) HIMS column names. */
export const HIMS_PRESETS: Record<string, Record<string, keyof ClaimUpsertRow>> = {
  Medixcel: {
    "claim ref no": "claim_number",
    "patient full name": "patient_name",
    "tpa": "tpa_name",
    "insurer": "insurance_company_name",
    "claim status": "claim_status",
    "billing date": "claim_creation_date",
    "admission date": "date_of_admission",
    "discharge date": "date_of_discharge",
    "gross amount": "claimed_amount",
    "approved amount": "approved_amount",
    "settled amount": "settled_amount",
    "tds": "tds_amount",
    "consultant": "treating_doctor",
    "room category": "ward",
    "coding user": "coder_name",
    "ip number": "in_patient_number",
    "unit name": "hospital_name",
    "denial reason": "insurer_comments",
  },
  Insta: {
    "claim number": "claim_number",
    "patient name": "patient_name",
    "tpa name": "tpa_name",
    "insurance company": "insurance_company_name",
    "current status": "claim_status",
    "claim date": "claim_creation_date",
    "date of admission": "date_of_admission",
    "date of discharge": "date_of_discharge",
    "bill amount": "claimed_amount",
    "sanctioned amount": "approved_amount",
    "paid amount": "settled_amount",
    "tds amount": "tds_amount",
    "doctor name": "treating_doctor",
    "room type": "ward",
    "medical coder": "coder_name",
    "uhid": "in_patient_number",
    "hospital": "hospital_name",
    "reject reason": "insurer_comments",
  },
  Birlamedisoft: {
    "claim no": "claim_number",
    "pt name": "patient_name",
    "tpa": "tpa_name",
    "insurance co": "insurance_company_name",
    "status": "claim_status",
    "claim reg date": "claim_creation_date",
    "adm date": "date_of_admission",
    "dis date": "date_of_discharge",
    "claimed amt": "claimed_amount",
    "approved amt": "approved_amount",
    "settled amt": "settled_amount",
    "tds amt": "tds_amount",
    "surgeon": "treating_doctor",
    "bed category": "ward",
    "ip no": "in_patient_number",
    "branch": "hospital_name",
    "denial remarks": "insurer_comments",
  },
  Napier: {
    "claim id": "claim_number",
    "name of patient": "patient_name",
    "tpa name": "tpa_name",
    "payer name": "insurance_company_name",
    "claim status": "claim_status",
    "claim logged date": "claim_creation_date",
    "doa": "date_of_admission",
    "dod": "date_of_discharge",
    "claim value": "claimed_amount",
    "approved value": "approved_amount",
    "net paid": "settled_amount",
    "tds deducted": "tds_amount",
    "physician": "treating_doctor",
    "ward": "ward",
    "coder": "coder_name",
    "mr no": "in_patient_number",
    "facility": "hospital_name",
    "denial reason code": "insurer_comments",
  },
  "IHX Template": {}, // native template — auto-detect handles it
};

/** Fuzzy match a HIMS column name to a claim field. */
export function guessField(header: string): keyof ClaimUpsertRow | null {
  const h = header.trim().toLowerCase().replace(/\s+/g, " ");
  if (!h) return null;
  for (const [field, patterns] of Object.entries(FIELD_TOKENS)) {
    for (const rx of patterns) {
      if (rx.test(h)) return field as keyof ClaimUpsertRow;
    }
  }
  return null;
}

/** Given detected HIMS headers, produce a header→field map. */
export function autoDetectMapping(headers: string[]): Record<string, keyof ClaimUpsertRow> {
  const out: Record<string, keyof ClaimUpsertRow> = {};
  const used = new Set<keyof ClaimUpsertRow>();
  for (const h of headers) {
    const g = guessField(h);
    if (g && !used.has(g)) {
      out[h] = g;
      used.add(g);
    }
  }
  return out;
}

/** Apply a HIMS preset against the detected headers (case-insensitive lookup). */
export function applyPreset(
  preset: Record<string, keyof ClaimUpsertRow>,
  headers: string[],
): Record<string, keyof ClaimUpsertRow> {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const presetLC: Record<string, keyof ClaimUpsertRow> = {};
  for (const [k, v] of Object.entries(preset)) presetLC[norm(k)] = v;
  const out: Record<string, keyof ClaimUpsertRow> = {};
  for (const h of headers) {
    const v = presetLC[norm(h)];
    if (v) out[h] = v;
  }
  return out;
}

// -------- Data readiness scoring ---------------------------------------------

export interface FeatureRequirement {
  key: string;
  name: string;
  description: string;
  required: (keyof ClaimUpsertRow)[];
}

/** Analytics features and the fields they need. Order = priority in the UI. */
export const FEATURE_REQUIREMENTS: FeatureRequirement[] = [
  {
    key: "core",
    name: "Core claim tracking",
    description: "Claim register, ageing, outstanding & KPIs",
    required: ["claim_number", "patient_name", "tpa_name", "claim_status", "claim_creation_date", "claimed_amount", "approved_amount", "settled_amount"],
  },
  {
    key: "submission_tat",
    name: "Submission TAT by doctor / ward / coder",
    description: "Time from discharge → document submission with SLA breach alerts",
    required: ["date_of_discharge", "doc_submission_date", "treating_doctor", "ward", "coder_name"],
  },
  {
    key: "denials",
    name: "Denial analytics & appeals workflow",
    description: "Denial code tagging, recovery rate, appeal checklists",
    required: ["insurer_comments", "shortfall_amount", "approved_amount"],
  },
  {
    key: "payer_scorecard",
    name: "Payer / TPA benchmarks",
    description: "TAT, denial %, deduction % by payer with trend charts",
    required: ["tpa_name", "insurance_company_name", "claim_creation_date", "payment_update_date", "approved_amount", "settled_amount"],
  },
  {
    key: "recon",
    name: "Bank reconciliation & TDS matching",
    description: "UTR → claim matching and short-payment alerts",
    required: ["cheque_neft_utr_no", "cheque_neft_utr_date", "settled_amount", "tds_amount"],
  },
  {
    key: "communications",
    name: "TPA / hospital SPOC communications",
    description: "Auto-address follow-ups & escalations to the right contact",
    required: ["tpa_spoc", "hospital_spoc"],
  },
  {
    key: "leakage",
    name: "Underpayment root-cause tagging",
    description: "Tariff / package / co-pay leakage classification",
    required: ["claimed_amount", "approved_amount", "shortfall_amount", "hospital_discount", "copay", "policy_type", "treatment"],
  },
  {
    key: "corporate",
    name: "Corporate / policy-holder analytics",
    description: "Utilisation by employer and policy type",
    required: ["policy_holder_name", "employee_code", "policy_type"],
  },
];

export interface FeatureReadiness {
  feature: FeatureRequirement;
  mapped: (keyof ClaimUpsertRow)[];
  missing: (keyof ClaimUpsertRow)[];
  score: number; // 0-1
}

export function computeReadiness(
  mapping: Record<string, keyof ClaimUpsertRow>,
): { overall: number; features: FeatureReadiness[] } {
  const mappedFields = new Set(Object.values(mapping));
  const features = FEATURE_REQUIREMENTS.map((f) => {
    const mapped = f.required.filter((r) => mappedFields.has(r));
    const missing = f.required.filter((r) => !mappedFields.has(r));
    return { feature: f, mapped, missing, score: mapped.length / f.required.length };
  });
  const overall = features.reduce((s, f) => s + f.score, 0) / features.length;
  return { overall, features };
}

export function fieldLabel(field: keyof ClaimUpsertRow): string {
  return MAPPABLE_FIELDS.find((m) => m.field === field)?.label ?? String(field);
}
