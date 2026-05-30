export interface Claim {
  id: string;
  ihx_ref_id: string;
  hospital_name: string;
  patient_name: string;
  patient_contact: string | null;
  in_patient_number: string | null;
  member_customer_id: string | null;
  date_of_admission: string | null;
  date_of_discharge: string | null;
  tpa_name: string;
  insurance_company_name: string | null;
  policy_number: string | null;
  claim_number: string;
  initial_claim_number: string | null;
  claim_creation_date: string;
  claimed_amount: number;
  approved_amount: number;
  copay: number;
  shortfall_amount: number;
  hospital_discount: number;
  patient_paid_amount: number;
  settled_amount: number;
  tds_amount: number;
  cheque_neft_utr_no: string | null;
  cheque_neft_utr_date: string | null;
  receipt_no: string | null;
  claim_status: string;
  doc_submission_date: string | null;
  payment_update_date: string | null;
  treatment: string | null;
  diagnosis: string | null;
  policy_type: string | null;
  policy_holder_name: string | null;
  employee_code: string | null;
  insurer_comments: string | null;
  outstanding_amount: number;
  days_since_claim: number;
  is_irdai_breach: boolean;
  // Multi-branch hospital model (resolved on import; optional on mock data)
  hospital_group_id?: string | null;
  hospital_branch_id?: string | null;
  // Editable workflow fields (synced to master)
  tpa_spoc?: string | null;
  hospital_spoc?: string | null;
  last_communication_at?: string | null;
  last_communication_note?: string | null;
  remarks?: string | null;
  action_plan?: string | null;
  // Per-row quality scoring (written by the DQ engine; absent on mock data)
  data_quality?: {
    tag?: "clean" | "warning" | "error" | "critical";
    included?: boolean;
    removable?: boolean;
    exclusionReasons?: string[];
    statusBucket?: string;
    bucketOverridden?: boolean;
    imputedSubmissionDate?: string | null;
    issues?: Array<{ code: string; layer: number; message: string; severity: string; field?: string }>;
  } | null;
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0;
}

export const mockClaims: Claim[] = [
  {
    id: "1", ihx_ref_id: "12219968", hospital_name: "Aster Prime Hospital - Hyderabad",
    patient_name: "Ale Anjaneyulu", patient_contact: "9491453145", in_patient_number: "252320",
    member_customer_id: "4067233858", date_of_admission: "2025-03-31", date_of_discharge: "2025-04-04",
    tpa_name: "Medi Assist Insurance TPA India Pvt Ltd", insurance_company_name: "SBI General Insurance Co. Ltd.",
    policy_number: "4101241200000134-00", claim_number: "129799368", initial_claim_number: "129799368",
    claim_creation_date: "2025-04-01", claimed_amount: 84706, approved_amount: 55464, copay: 13866,
    shortfall_amount: 0, hospital_discount: 6181, patient_paid_amount: 23060, settled_amount: 49918,
    tds_amount: 5546, cheque_neft_utr_no: "SBIN325111934634", cheque_neft_utr_date: "2025-04-21",
    receipt_no: "AD26 96", claim_status: "Settled", doc_submission_date: "2025-04-07",
    payment_update_date: "2025-04-23", treatment: "TIA", diagnosis: "TIA",
    policy_type: "Base Policy", policy_holder_name: null, employee_code: "TLG2036",
    insurer_comments: "CL-Claim Settled",
    outstanding_amount: 84706 - 49918 - 13866 - 6181 - 23060, days_since_claim: daysSince("2025-04-01"),
    is_irdai_breach: false,
  },
  {
    id: "2", ihx_ref_id: "12219387", hospital_name: "Aster Prime Hospital - Hyderabad",
    patient_name: "Daddanala Lakshmi Narayana", patient_contact: null, in_patient_number: null,
    member_customer_id: "9998011606", date_of_admission: "2025-03-06", date_of_discharge: "2025-03-08",
    tpa_name: "Niva Bupa Health Insurance", insurance_company_name: "Niva Bupa Health Insurance Company Limited",
    policy_number: null, claim_number: "2000308824", initial_claim_number: null,
    claim_creation_date: "2025-04-01", claimed_amount: 544000, approved_amount: 307484, copay: 0,
    shortfall_amount: 0, hospital_discount: 0, patient_paid_amount: 0, settled_amount: 307484,
    tds_amount: 0, cheque_neft_utr_no: null, cheque_neft_utr_date: null,
    receipt_no: null, claim_status: "Settled", doc_submission_date: null,
    payment_update_date: "2025-04-01", treatment: null, diagnosis: null,
    policy_type: "Base Policy", policy_holder_name: "Kyndryl Solutions Private Limited", employee_code: null,
    insurer_comments: null,
    outstanding_amount: 544000 - 307484, days_since_claim: daysSince("2025-04-01"),
    is_irdai_breach: false,
  },
  {
    id: "3", ihx_ref_id: "12221792", hospital_name: "Aster Prime Hospital - Hyderabad",
    patient_name: "Krishna Devi", patient_contact: "9866167412", in_patient_number: "252558",
    member_customer_id: "5136034880", date_of_admission: "2025-04-09", date_of_discharge: "2025-04-09",
    tpa_name: "Medi Assist Insurance TPA India Pvt Ltd", insurance_company_name: "The New India Assurance Co. Ltd",
    policy_number: "97000034240400000051_SEZ", claim_number: "43050074", initial_claim_number: "MA12221792",
    claim_creation_date: "2025-04-01", claimed_amount: 61335, approved_amount: 34477, copay: 8099,
    shortfall_amount: 0, hospital_discount: 6016, patient_paid_amount: 9428, settled_amount: 31029,
    tds_amount: 3448, cheque_neft_utr_no: "AXISCN0963602896", cheque_neft_utr_date: "2025-04-17",
    receipt_no: "AD26 233 249", claim_status: "Settled", doc_submission_date: "2025-04-11",
    payment_update_date: "2025-04-23", treatment: "Chemotherapy", diagnosis: "Carcinoma Ovary",
    policy_type: "Base Policy", policy_holder_name: null, employee_code: "944411",
    insurer_comments: "CL-Claim Settled",
    outstanding_amount: 61335 - 31029 - 8099 - 6016 - 9428, days_since_claim: daysSince("2025-04-01"),
    is_irdai_breach: false,
  },
  {
    id: "4", ihx_ref_id: "12220680", hospital_name: "Aster Prime Hospital - Hyderabad",
    patient_name: "Mr Sripally Narender", patient_contact: "8885457234", in_patient_number: "252321",
    member_customer_id: "5136143473", date_of_admission: "2025-03-31", date_of_discharge: "2025-04-03",
    tpa_name: "Medi Assist Insurance TPA India Pvt Ltd", insurance_company_name: "The New India Assurance Co. Ltd",
    policy_number: "12210034240400000106", claim_number: "43048379", initial_claim_number: "43048379",
    claim_creation_date: "2025-04-01", claimed_amount: 54196, approved_amount: 50755, copay: 0,
    shortfall_amount: 0, hospital_discount: 3441, patient_paid_amount: 0, settled_amount: 45679,
    tds_amount: 5076, cheque_neft_utr_no: "AXISCN0961347865", cheque_neft_utr_date: "2025-04-15",
    receipt_no: "00", claim_status: "Settled", doc_submission_date: "2025-04-07",
    payment_update_date: "2025-04-19", treatment: "CAD UNSTABLE ANGINA", diagnosis: "CAD Unstable Angina",
    policy_type: "Base Policy", policy_holder_name: null, employee_code: "50148884",
    insurer_comments: "CL-Claim Settled",
    outstanding_amount: 54196 - 45679 - 3441, days_since_claim: daysSince("2025-04-01"),
    is_irdai_breach: false,
  },
  {
    id: "5", ihx_ref_id: "12222692", hospital_name: "Aster Prime Hospital - Hyderabad",
    patient_name: "Narasaraju Uppalapati", patient_contact: "9849549355", in_patient_number: "252351",
    member_customer_id: "4058265847", date_of_admission: "2025-04-01", date_of_discharge: "2025-04-03",
    tpa_name: "Medi Assist Insurance TPA India Pvt Ltd", insurance_company_name: "Universal Sompo General Insurance Co. Ltd.",
    policy_number: "2816/73830493/00/000", claim_number: "129805581", initial_claim_number: "129805581",
    claim_creation_date: "2025-04-01", claimed_amount: 192929, approved_amount: 166734, copay: 0,
    shortfall_amount: 0, hospital_discount: 661, patient_paid_amount: 22752, settled_amount: 150061,
    tds_amount: 16673, cheque_neft_utr_no: "AXISCN1015317102", cheque_neft_utr_date: "2025-07-09",
    receipt_no: "AD26 13 68", claim_status: "Settled", doc_submission_date: "2025-04-07",
    payment_update_date: "2025-07-15", treatment: "ORIF RIGHT DISTAL RADIUS", diagnosis: "Right distal radius fracture",
    policy_type: "Base Policy", policy_holder_name: "Vasudha Pharma Chem Ltd", employee_code: "15250",
    insurer_comments: "CL-Claim Settled",
    outstanding_amount: 192929 - 150061 - 661 - 22752, days_since_claim: daysSince("2025-04-01"),
    is_irdai_breach: false,
  },
  {
    id: "6", ihx_ref_id: "12221968", hospital_name: "Aster Prime Hospital - Hyderabad",
    patient_name: "V Archana", patient_contact: "9885377779", in_patient_number: null,
    member_customer_id: "0515002824P106755115", date_of_admission: "2025-03-31", date_of_discharge: "2025-04-05",
    tpa_name: "Vidal Health Insurance TPA Private Limited", insurance_company_name: null,
    policy_number: null, claim_number: "PAQ-001", initial_claim_number: null,
    claim_creation_date: "2025-04-01", claimed_amount: 120000, approved_amount: 0, copay: 0,
    shortfall_amount: 0, hospital_discount: 0, patient_paid_amount: 0, settled_amount: 0,
    tds_amount: 0, cheque_neft_utr_no: null, cheque_neft_utr_date: null,
    receipt_no: null, claim_status: "Pre Auth Query", doc_submission_date: null,
    payment_update_date: null, treatment: "EXPLORATION TENDON REPAIR", diagnosis: "Abrasions",
    policy_type: "Base Policy", policy_holder_name: null, employee_code: null,
    insurer_comments: null,
    outstanding_amount: 120000, days_since_claim: daysSince("2025-04-01"),
    is_irdai_breach: true,
  },
  {
    id: "7", ihx_ref_id: "12243614", hospital_name: "Aster Prime Hospital - Hyderabad",
    patient_name: "BADAKALA PRAKASH", patient_contact: "9440969856", in_patient_number: null,
    member_customer_id: "2023310026041673", date_of_admission: "2025-04-04", date_of_discharge: "2025-04-07",
    tpa_name: "HDFC ERGO General Insurance", insurance_company_name: "HDFC ERGO",
    policy_number: "2856205298726802", claim_number: "RC-HS25-14824081", initial_claim_number: "RC-HS25-14824081",
    claim_creation_date: "2025-04-02", claimed_amount: 17500, approved_amount: 0, copay: 0,
    shortfall_amount: 0, hospital_discount: 0, patient_paid_amount: 0, settled_amount: 0,
    tds_amount: 0, cheque_neft_utr_no: null, cheque_neft_utr_date: null,
    receipt_no: null, claim_status: "Pre Auth Denied", doc_submission_date: null,
    payment_update_date: null, treatment: "UNSTABLE ANGINA", diagnosis: "Unstable Angina",
    policy_type: "Base Policy", policy_holder_name: "BADAKALA PRAKASH", employee_code: null,
    insurer_comments: null,
    outstanding_amount: 17500, days_since_claim: daysSince("2025-04-02"),
    is_irdai_breach: false,
  },
  {
    id: "8", ihx_ref_id: "12244196", hospital_name: "Aster Prime Hospital - Hyderabad",
    patient_name: "VISHNU PRABHU S", patient_contact: "9949870171", in_patient_number: null,
    member_customer_id: "NI0700120920", date_of_admission: "2025-04-03", date_of_discharge: "2025-04-17",
    tpa_name: "Safeway Insurance TPA Private Limited", insurance_company_name: null,
    policy_number: "550300/50/24/10000785", claim_number: "NI-7-21174", initial_claim_number: "NI-7-21174",
    claim_creation_date: "2025-04-02", claimed_amount: 45080, approved_amount: 25000, copay: 0,
    shortfall_amount: 0, hospital_discount: 0, patient_paid_amount: 0, settled_amount: 0,
    tds_amount: 0, cheque_neft_utr_no: null, cheque_neft_utr_date: null,
    receipt_no: null, claim_status: "Discharge Denied", doc_submission_date: null,
    payment_update_date: null, treatment: "RIGHT ICA STENOSIS TIA SEIZURE", diagnosis: "RIGHT ICA STENOSIS TIA SEIZURE",
    policy_type: "Base Policy", policy_holder_name: null, employee_code: null,
    insurer_comments: null,
    outstanding_amount: 45080, days_since_claim: daysSince("2025-04-02"),
    is_irdai_breach: true,
  },
  {
    id: "9", ihx_ref_id: "12256614", hospital_name: "Aster Prime Hospital - Hyderabad",
    patient_name: "Mr.Abdul Rasheed", patient_contact: "7013753564", in_patient_number: "252410",
    member_customer_id: "6250641", date_of_admission: "2025-04-03", date_of_discharge: "2025-04-05",
    tpa_name: "Ericson Insurance TPA Pvt. Ltd", insurance_company_name: null,
    policy_number: "P/170000/01/2025/077228", claim_number: "552969", initial_claim_number: "552969",
    claim_creation_date: "2025-04-03", claimed_amount: 78676, approved_amount: 75217, copay: 0,
    shortfall_amount: 0, hospital_discount: 0, patient_paid_amount: 3459, settled_amount: 0,
    tds_amount: 0, cheque_neft_utr_no: null, cheque_neft_utr_date: null,
    receipt_no: "AD26 63", claim_status: "Settlement Initiated", doc_submission_date: "2025-04-08",
    payment_update_date: null, treatment: "ACUTE HEART FAILURE", diagnosis: "Acute heart failure",
    policy_type: "Base Policy", policy_holder_name: null, employee_code: null,
    insurer_comments: null,
    outstanding_amount: 78676 - 3459, days_since_claim: daysSince("2025-04-03"),
    is_irdai_breach: true,
  },
  {
    id: "10", ihx_ref_id: "12280094", hospital_name: "Aster Prime Hospital - Hyderabad",
    patient_name: "Siriki Kannam Naidu", patient_contact: "8790993359", in_patient_number: null,
    member_customer_id: "MDI5-0038401218", date_of_admission: "2025-04-07", date_of_discharge: "2025-05-10",
    tpa_name: "MDIndia Health Insurance TPA Pvt. Ltd.", insurance_company_name: "Future Generali India Insurance Company Limited",
    policy_number: "FGH-16-24-7005024-01-000", claim_number: "MDI9349537", initial_claim_number: "IN_050425_2679",
    claim_creation_date: "2025-04-05", claimed_amount: 125000, approved_amount: 54730, copay: 6081,
    shortfall_amount: 0, hospital_discount: 0, patient_paid_amount: 0, settled_amount: 0,
    tds_amount: 0, cheque_neft_utr_no: null, cheque_neft_utr_date: null,
    receipt_no: null, claim_status: "Discharge Approved", doc_submission_date: null,
    payment_update_date: null, treatment: "URSL + DJ STENTING", diagnosis: "Calculus of kidney and ureter",
    policy_type: "Base Policy", policy_holder_name: "Siriki Kannam Naidu", employee_code: "30588",
    insurer_comments: null,
    outstanding_amount: 125000 - 6081, days_since_claim: daysSince("2025-04-05"),
    is_irdai_breach: true,
  },
];

// Helper to get status color
export const getStatusColor = (status: string): string => {
  const s = status.toLowerCase();
  // Semantic status palette: green = settled, red = denial, orange = approval
  if (s.includes('settlement initiated')) return 'bg-success/80 text-success-foreground';
  if (s.includes('settled')) return 'bg-success text-success-foreground';
  if (s.includes('denied') || s.includes('denial') || s.includes('rejected')) return 'bg-denial text-denial-foreground';
  if (s.includes('approved') || s.includes('approval')) return 'bg-warning text-warning-foreground';
  if (s.includes('query')) return 'bg-aging-30 text-aging-30-foreground';
  if (s.includes('initiated')) return 'bg-secondary text-secondary-foreground';
  return 'bg-muted text-muted-foreground';
};

/**
 * Canonical INR formatters. Use these everywhere to keep numbers consistent
 * across dashboards, tables, charts, emails, and notifications.
 *
 * - `formatInr`       → Full number with grouping, e.g. ₹84,706
 * - `formatInrShort`  → Crore / Lakh abbreviated with 2 decimals, e.g. ₹7.75 Cr
 * - `formatInrCompact`→ Like short but adds "K" for thousands; used in tight UI
 *
 * All formatters use the Indian numbering system (Cr = 1,00,00,000, L = 1,00,000),
 * an "en-IN" grouping locale, and the ₹ glyph (no spaces between ₹ and digits
 * for full numbers; one space before "Cr"/"L"/"K" for abbreviated forms).
 */
export const formatInr = (n: number): string => {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? "-" : "";
  return `${sign}₹${Math.abs(v).toLocaleString("en-IN")}`;
};

export const formatInrShort = (n: number): string => {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
};

export const formatInrCompact = (n: number): string => {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)} K`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
};

/**
 * Pending-days formatter — single source of truth across all lists,
 * tables, drawers, and cards. Always renders as `12 d` (with a thin
 * non-breaking space) so columns line up under `tabular-nums`.
 *
 *   formatDays(0)        → "0 d"
 *   formatDays(12)       → "12 d"
 *   formatDays(7, {long: true}) → "7 days"
 *   formatDays(null)     → "—"
 */
export const formatDays = (
  n: number | null | undefined,
  opts: { long?: boolean; suffix?: string } = {},
): string => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const v = Math.max(0, Math.round(Number(n)));
  const unit = opts.long ? (v === 1 ? "day" : "days") : "d";
  const suffix = opts.suffix ? ` ${opts.suffix}` : "";
  return `${v}\u202F${unit}${suffix}`;
};

