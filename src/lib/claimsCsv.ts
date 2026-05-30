// Generic CSV exporter for claim tables.
// Triggers a browser download of the rows currently visible in any table.
import type { Claim } from "@/data/mockClaims";

const COLUMNS: { key: keyof Claim; label: string }[] = [
  { key: "claim_number", label: "Claim No" },
  { key: "patient_name", label: "Patient Name" },
  { key: "hospital_name", label: "Hospital" },
  { key: "tpa_name", label: "TPA" },
  { key: "insurance_company_name", label: "Insurance" },
  { key: "policy_number", label: "Policy No" },
  { key: "date_of_admission", label: "Admission" },
  { key: "date_of_discharge", label: "Discharge" },
  { key: "claim_creation_date", label: "Claim Date" },
  { key: "days_since_claim", label: "Age (days)" },
  { key: "claim_status", label: "Status" },
  { key: "claimed_amount", label: "Claimed" },
  { key: "approved_amount", label: "Approved" },
  { key: "settled_amount", label: "Settled" },
  { key: "outstanding_amount", label: "Outstanding" },
  { key: "shortfall_amount", label: "Shortfall" },
  { key: "tds_amount", label: "TDS" },
  { key: "is_irdai_breach", label: "IRDAI Breach" },
  { key: "tpa_spoc", label: "TPA SPOC" },
  { key: "hospital_spoc", label: "Hospital SPOC" },
  { key: "remarks", label: "Remarks" },
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportClaimsCsv(rows: Claim[], filename = "claims.csv"): void {
  const header = COLUMNS.map((c) => c.label).join(",");
  const body = rows
    .map((r) => COLUMNS.map((c) => csvEscape(r[c.key])).join(","))
    .join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = filename.includes(".") ? filename : `${filename}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
