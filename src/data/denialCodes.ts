// Standardized denial reason codes for Indian health insurance RCM
// Aligned with SLA / common TPA practice

export type DenialCategory =
  | "Medical Necessity"
  | "Policy / Coverage"
  | "Documentation"
  | "Tariff / Sub-limit"
  | "Pre-existing / Non-disclosure"
  | "Process / Administrative";

export interface DenialCode {
  code: string;
  description: string;
  category: DenialCategory;
  appealable: boolean;
  // typical recovery probability when appealed (0-1)
  recoveryRate: number;
}

export const DENIAL_CODES: DenialCode[] = [
  // Medical Necessity
  { code: "MN-01", description: "Treatment not medically necessary", category: "Medical Necessity", appealable: true, recoveryRate: 0.55 },
  { code: "MN-02", description: "OPD procedure billed as IPD", category: "Medical Necessity", appealable: true, recoveryRate: 0.40 },
  { code: "MN-03", description: "Length of stay not justified", category: "Medical Necessity", appealable: true, recoveryRate: 0.65 },

  // Policy / Coverage
  { code: "PC-01", description: "Treatment excluded under policy", category: "Policy / Coverage", appealable: false, recoveryRate: 0.10 },
  { code: "PC-02", description: "Waiting period not completed", category: "Policy / Coverage", appealable: false, recoveryRate: 0.05 },
  { code: "PC-03", description: "Policy lapsed / not in force", category: "Policy / Coverage", appealable: false, recoveryRate: 0.02 },

  // Documentation
  { code: "DOC-01", description: "Discharge summary missing / incomplete", category: "Documentation", appealable: true, recoveryRate: 0.92 },
  { code: "DOC-02", description: "Investigation reports not submitted", category: "Documentation", appealable: true, recoveryRate: 0.88 },
  { code: "DOC-03", description: "Indoor case papers not provided", category: "Documentation", appealable: true, recoveryRate: 0.85 },
  { code: "DOC-04", description: "KYC / ID proof mismatch", category: "Documentation", appealable: true, recoveryRate: 0.95 },

  // Tariff / Sub-limit
  { code: "TR-01", description: "Room rent exceeds eligibility (proportionate cut)", category: "Tariff / Sub-limit", appealable: true, recoveryRate: 0.30 },
  { code: "TR-02", description: "Non-payable consumables / admin charges", category: "Tariff / Sub-limit", appealable: false, recoveryRate: 0.15 },
  { code: "TR-03", description: "Tariff above PPN / network rate", category: "Tariff / Sub-limit", appealable: true, recoveryRate: 0.45 },
  { code: "TR-04", description: "Procedure sub-limit exhausted", category: "Tariff / Sub-limit", appealable: false, recoveryRate: 0.08 },

  // Pre-existing / Non-disclosure
  { code: "PED-01", description: "Pre-existing disease — non-disclosure", category: "Pre-existing / Non-disclosure", appealable: true, recoveryRate: 0.20 },
  { code: "PED-02", description: "PED waiting period not completed", category: "Pre-existing / Non-disclosure", appealable: false, recoveryRate: 0.05 },

  // Process
  { code: "PR-01", description: "Pre-authorization not obtained", category: "Process / Administrative", appealable: true, recoveryRate: 0.50 },
  { code: "PR-02", description: "Late intimation beyond TAT", category: "Process / Administrative", appealable: true, recoveryRate: 0.60 },
  { code: "PR-03", description: "Cashless declined — reimbursement only", category: "Process / Administrative", appealable: true, recoveryRate: 0.70 },
];

export const CATEGORY_COLORS: Record<DenialCategory, string> = {
  "Medical Necessity": "hsl(0, 70%, 45%)",
  "Policy / Coverage": "hsl(15, 75%, 42%)",
  "Documentation": "hsl(30, 88%, 45%)",
  "Tariff / Sub-limit": "hsl(45, 90%, 42%)",
  "Pre-existing / Non-disclosure": "hsl(280, 50%, 42%)",
  "Process / Administrative": "hsl(220, 50%, 45%)",
};

// Map free-text claim_status / insurer_comments → standardized code
export function mapToDenialCode(status: string, comment?: string | null): DenialCode | null {
  const s = (status || "").toLowerCase();
  const c = (comment || "").toLowerCase();
  const blob = `${s} ${c}`;

  if (!blob.includes("deni") && !blob.includes("query") && !blob.includes("reject") && !blob.includes("short")) {
    return null;
  }

  if (blob.includes("pre auth") || blob.includes("pre-auth") || blob.includes("preauth")) {
    if (blob.includes("not obtain") || blob.includes("missing")) return DENIAL_CODES.find(d => d.code === "PR-01")!;
    return DENIAL_CODES.find(d => d.code === "PR-01")!;
  }
  if (blob.includes("document") || blob.includes("discharge sum") || blob.includes("investigation")) {
    return DENIAL_CODES.find(d => d.code === "DOC-01")!;
  }
  if (blob.includes("ped") || blob.includes("pre-existing") || blob.includes("non-disclosure")) {
    return DENIAL_CODES.find(d => d.code === "PED-01")!;
  }
  if (blob.includes("room rent") || blob.includes("proportionate")) {
    return DENIAL_CODES.find(d => d.code === "TR-01")!;
  }
  if (blob.includes("sub-limit") || blob.includes("sublimit") || blob.includes("exhaust")) {
    return DENIAL_CODES.find(d => d.code === "TR-04")!;
  }
  if (blob.includes("exclud") || blob.includes("not covered")) {
    return DENIAL_CODES.find(d => d.code === "PC-01")!;
  }
  if (blob.includes("waiting")) {
    return DENIAL_CODES.find(d => d.code === "PC-02")!;
  }
  if (blob.includes("medical necess") || blob.includes("not necess")) {
    return DENIAL_CODES.find(d => d.code === "MN-01")!;
  }
  if (blob.includes("query")) {
    return DENIAL_CODES.find(d => d.code === "DOC-02")!;
  }
  if (blob.includes("discharge denied")) {
    return DENIAL_CODES.find(d => d.code === "MN-03")!;
  }
  if (blob.includes("denied")) {
    return DENIAL_CODES.find(d => d.code === "MN-01")!;
  }
  return null;
}
