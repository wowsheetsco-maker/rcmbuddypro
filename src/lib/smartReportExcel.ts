import * as XLSX from "xlsx";
import type { Claim } from "@/data/mockClaims";
import type { ReportKind } from "@/lib/smartReports";

const SETTLED = new Set(["settled", "paid", "closed"]);
const DENIED = new Set([
  "pre auth denied", "claim denied", "discharge denied",
  "enhancement denied", "denied", "rejected",
]);

function classify(c: Claim): "settled" | "denied" | "open" | "unsubmitted" {
  const k = (c.claim_status || "").toLowerCase();
  if (SETTLED.has(k)) return "settled";
  if (DENIED.has(k)) return "denied";
  if (k === "draft" || k === "not submitted") return "unsubmitted";
  return "open";
}

function ageDays(d?: string | null) {
  if (!d) return 0;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function bucketLabel(d: number): string {
  if (d <= 30) return "0-30";
  if (d <= 60) return "31-60";
  if (d <= 90) return "61-90";
  if (d <= 180) return "91-180";
  return "180+";
}

/** Common claim row used across all report sheets. */
function claimRow(c: Claim) {
  return {
    "Claim #": c.claim_number,
    "TPA / Insurer": c.tpa_name,
    "Insurance Company": c.insurance_company_name ?? "",
    "Patient": c.patient_name,
    "Policy Holder": c.policy_holder_name ?? "",
    "Policy Type": c.policy_type ?? "",
    "Status": c.claim_status,
    "Claim Date": c.claim_creation_date,
    "Admission": c.date_of_admission ?? "",
    "Discharge": c.date_of_discharge ?? "",
    "Days Open": ageDays(c.claim_creation_date),
    "Aging Bucket": bucketLabel(ageDays(c.claim_creation_date)),
    "Claimed (₹)": c.claimed_amount || 0,
    "Approved (₹)": c.approved_amount || 0,
    "Settled (₹)": c.settled_amount || 0,
    "Outstanding (₹)": c.outstanding_amount || 0,
    "TDS (₹)": c.tds_amount || 0,
    "Shortfall (₹)": c.shortfall_amount || 0,
    "Insurer Comments": c.insurer_comments ?? "",
    "SLA Breach": c.is_irdai_breach ? "Yes" : "No",
  };
}

/** Returns true when the claim is a group / corporate (employer) policy. */
function isGroupCorporateClaim(c: Claim): boolean {
  const raw = (c.policy_holder_name || "").trim();
  if (!raw) return false;
  const insurer = (c.insurance_company_name || "").trim().toLowerCase();
  const lower = raw.toLowerCase();
  if (insurer && lower === insurer) return false;
  if (/(retail|individual|self|family floater)/.test(lower)) return false;
  if (/(ltd|pvt|llp|inc\b|corp|corporation|technologies|industries|systems|services|consult|bank|insurance|health assist|policy [a-z]\b|tcs|sbi|infosys|wipro)/.test(lower)) {
    return true;
  }
  return false;
}

interface BuildArgs {
  kind: ReportKind;
  claims: Claim[];
  hospitalName: string;
  periodLabel: string;
}

interface BuildCombinedArgs {
  kinds: ReportKind[];
  claims: Claim[];
  hospitalName: string;
  periodLabel: string;
}

/**
 * Builds an XLSX workbook tailored to the selected report kind.
 * - CEO: full filtered claim list + leakage summary.
 * - AR: outstanding claims + TPA-wise aging matrix.
 * - Denial: denied claims + reason summary.
 * - Corporate: corporate-only claims + employer summary.
 */
export function buildReportWorkbook({ kind, claims, hospitalName, periodLabel }: BuildArgs): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  appendCoverSheet(wb, [kind], hospitalName, periodLabel, claims.length);
  appendKindSheets(wb, kind, claims, /* suffix */ "");
  return wb;
}

/**
 * Build a multi-sheet workbook covering each selected report kind. Sheet
 * names are suffixed (e.g. "Outstanding · AR") to avoid collisions when
 * the same source-data sheet is produced by more than one report.
 */
export function buildCombinedReportWorkbook(
  { kinds, claims, hospitalName, periodLabel }: BuildCombinedArgs,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  appendCoverSheet(wb, kinds, hospitalName, periodLabel, claims.length);
  kinds.forEach((k) => {
    appendKindSheets(wb, k, claims, ` · ${kindShortLabel(k)}`);
  });
  return wb;
}

function appendCoverSheet(
  wb: XLSX.WorkBook,
  kinds: ReportKind[],
  hospitalName: string,
  periodLabel: string,
  totalClaims: number,
) {
  const rows: (string | number)[][] = [
    ["RCM Buddy — Smart Report Export"],
    [],
    ["Report(s)", kinds.map(reportTitle).join(", ")],
    ["Hospital", hospitalName],
    ["Period", periodLabel],
    ["Generated", new Date().toLocaleString("en-IN")],
    ["Total claims in scope", totalClaims],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Cover");
}

/** Append all sheets that belong to a single report kind. */
function appendKindSheets(wb: XLSX.WorkBook, kind: ReportKind, claims: Claim[], suffix: string) {
  // Excel sheet names are limited to 31 chars. Trim if needed.
  const name = (base: string) => `${base}${suffix}`.slice(0, 31);

  if (kind === "ceo") {
    const rows = claims.map(claimRow);
    const claimedSum = claims.reduce((s, c) => s + (c.claimed_amount || 0), 0);
    const approvedSum = claims.reduce((s, c) => s + (c.approved_amount || 0), 0);
    const settledSum = claims.reduce((s, c) => s + (c.settled_amount || 0), 0);
    const outstandingSum = claims
      .filter((c) => classify(c) !== "settled")
      .reduce((s, c) => s + (c.outstanding_amount || 0), 0);

    const summary = XLSX.utils.aoa_to_sheet([
      ["Metric", "Value"],
      ["Total Claims", claims.length],
      ["Total Claimed (₹)", claimedSum],
      ["Total Approved (₹)", approvedSum],
      ["Total Settled (₹)", settledSum],
      ["Total Outstanding (₹)", outstandingSum],
      ["Net Collection Rate (%)", approvedSum > 0 ? +((settledSum / approvedSum) * 100).toFixed(2) : 0],
    ]);
    XLSX.utils.book_append_sheet(wb, summary, name("CEO Summary"));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name("All Claims"));
  }

  if (kind === "ar") {
    const open = claims.filter((c) => classify(c) !== "settled");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(open.map(claimRow)), name("Outstanding"));

    const matrix: Record<string, { "0-30": number; "31-60": number; "61-90": number; "91-180": number; "180+": number; total: number; count: number }> = {};
    open.forEach((c) => {
      const k = c.tpa_name || "Unknown";
      if (!matrix[k]) matrix[k] = { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0, total: 0, count: 0 };
      const b = bucketLabel(ageDays(c.claim_creation_date)) as keyof typeof matrix[string];
      const amt = c.outstanding_amount || 0;
      if (b !== "total" && b !== "count") matrix[k][b] += amt;
      matrix[k].total += amt;
      matrix[k].count++;
    });
    const matrixRows = Object.entries(matrix)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([n, v]) => ({
        "TPA / Insurer": n, "Claims": v.count,
        "0-30": v["0-30"], "31-60": v["31-60"], "61-90": v["61-90"],
        "91-180": v["91-180"], "180+": v["180+"], "Total Outstanding (₹)": v.total,
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matrixRows), name("TPA Aging"));
  }

  if (kind === "denial") {
    const denied = claims.filter((c) => classify(c) === "denied");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(denied.map(claimRow)), name("Denied Claims"));

    const reasonAgg: Record<string, { count: number; amt: number }> = {};
    denied.forEach((c) => {
      const reason = (c.insurer_comments || "Unspecified").split(/[.,;\n]/)[0].trim().slice(0, 80) || "Unspecified";
      if (!reasonAgg[reason]) reasonAgg[reason] = { count: 0, amt: 0 };
      reasonAgg[reason].count++;
      reasonAgg[reason].amt += c.claimed_amount || 0;
    });
    const reasonRows = Object.entries(reasonAgg)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([r, v]) => ({ "Denial Reason": r, "Claims": v.count, "Claimed Value (₹)": v.amt }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reasonRows), name("Denial Reasons"));
  }

  if (kind === "corporate") {
    const corp = claims.filter(isGroupCorporateClaim);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(corp.map(claimRow)), name("Corporate Claims"));

    const corpAgg: Record<string, { count: number; claimed: number; settled: number; outstanding: number; denied: number }> = {};
    corp.forEach((c) => {
      const k = (c.policy_holder_name || "Unknown").trim();
      if (!corpAgg[k]) corpAgg[k] = { count: 0, claimed: 0, settled: 0, outstanding: 0, denied: 0 };
      corpAgg[k].count++;
      corpAgg[k].claimed += c.claimed_amount || 0;
      corpAgg[k].settled += c.settled_amount || 0;
      corpAgg[k].outstanding += c.outstanding_amount || 0;
      if (classify(c) === "denied") corpAgg[k].denied++;
    });
    const corpRows = Object.entries(corpAgg)
      .sort((a, b) => b[1].claimed - a[1].claimed)
      .map(([n, v]) => ({
        "Employer / Corporate": n,
        "Claims": v.count,
        "Claimed (₹)": v.claimed,
        "Settled (₹)": v.settled,
        "Outstanding (₹)": v.outstanding,
        "Denied Count": v.denied,
        "NCR (%)": v.claimed > 0 ? +((v.settled / v.claimed) * 100).toFixed(2) : 0,
      }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(corpRows), name("Employer Summary"));
  }
}

function reportTitle(kind: ReportKind): string {
  switch (kind) {
    case "ceo": return "CEO / CFO Revenue Intelligence";
    case "ar": return "AR Aging Report";
    case "denial": return "Denial & Appeal Report";
    case "corporate": return "Corporate Performance Report";
  }
}

function kindShortLabel(kind: ReportKind): string {
  switch (kind) {
    case "ceo": return "CEO";
    case "ar": return "AR";
    case "denial": return "Denial";
    case "corporate": return "Corp";
  }
}

export function downloadReportExcel(args: BuildArgs) {
  const wb = buildReportWorkbook(args);
  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const fname = `RCM-${args.kind}-${safe(args.hospitalName)}-${Date.now()}.xlsx`;
  XLSX.writeFile(wb, fname);
}

export function downloadCombinedReportExcel(args: BuildCombinedArgs) {
  const wb = buildCombinedReportWorkbook(args);
  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const fname = `RCM-combined-${safe(args.hospitalName)}-${Date.now()}.xlsx`;
  XLSX.writeFile(wb, fname);
}

