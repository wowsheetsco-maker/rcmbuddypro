// Export the currently filtered discrepancy list as an XLSX with a header
// summary + per-row claim breakdown. Pure helper, called from the page.

import * as XLSX from "xlsx";
import { inrShort, type DiscrepancyMetrics } from "./discrepancy";
import type { Claim } from "@/data/mockClaims";

export interface DiscrepancyExportRow {
  claim: Claim;
  metrics: DiscrepancyMetrics;
  lastAction?: string | null;
  lastActionAt?: string | null;
  emailsSent?: number;
  stage?: string;
}

export interface DiscrepancyExportOptions {
  hospitalName?: string;
  stageLabel?: string;          // "Discrepancy" | "Appeal Manager"
  filterSummary?: string;       // human-readable filters applied
}

function fmtDate(d?: string | null): string {
  if (!d) return "";
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return d;
  return t.toLocaleString("en-IN", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function exportDiscrepancyXlsx(
  rows: DiscrepancyExportRow[],
  options: DiscrepancyExportOptions = {},
): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary ──────────────────────────────────────────────
  const totalAmount = rows.reduce((s, r) => s + r.metrics.amount, 0);
  const byBand: Record<string, { count: number; amount: number }> = {
    high: { count: 0, amount: 0 },
    medium: { count: 0, amount: 0 },
    low: { count: 0, amount: 0 },
  };
  const byTpa = new Map<string, { count: number; amount: number }>();
  for (const r of rows) {
    const band = r.metrics.band ?? "low";
    byBand[band].count += 1;
    byBand[band].amount += r.metrics.amount;
    const tpa = r.claim.tpa_name || "Unknown";
    const cur = byTpa.get(tpa) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += r.metrics.amount;
    byTpa.set(tpa, cur);
  }

  const summaryAoa: (string | number)[][] = [
    ["Discrepancy Tracker — Export"],
    [],
    ["Hospital",        options.hospitalName ?? ""],
    ["Stage",           options.stageLabel ?? "Discrepancy"],
    ["Generated at",    new Date().toLocaleString("en-IN")],
    ["Filters",         options.filterSummary ?? "None"],
    [],
    ["Totals"],
    ["Total claims",         rows.length],
    ["Total discrepancy ₹",  totalAmount],
    [],
    ["By severity"],
    ["Severity", "Claims", "Amount (₹)"],
    ["HIGH",   byBand.high.count,   byBand.high.amount],
    ["MED",    byBand.medium.count, byBand.medium.amount],
    ["LOW",    byBand.low.count,    byBand.low.amount],
    [],
    ["By TPA / Insurer"],
    ["TPA / Insurer", "Claims", "Amount (₹)"],
    ...Array.from(byTpa.entries())
      .sort((a, b) => b[1].amount - a[1].amount)
      .map(([tpa, v]) => [tpa, v.count, v.amount] as [string, number, number]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (wsSummary as any)["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 2: Claims (the main list) ───────────────────────────────
  const detail = rows.map((r) => ({
    "Claim No":          r.claim.claim_number,
    "Patient":           r.claim.patient_name,
    "TPA / Insurer":     r.claim.tpa_name,
    "Insurance":         r.claim.insurance_company_name ?? "",
    "Policy No":         r.claim.policy_number ?? "",
    "Admission":         r.claim.date_of_admission ?? "",
    "Discharge":         r.claim.date_of_discharge ?? "",
    "Status":            r.claim.claim_status,
    "Approved (₹)":      r.claim.approved_amount,
    "Settled (₹)":       r.claim.settled_amount,
    "TDS (₹)":           r.claim.tds_amount,
    "Settled+TDS (₹)":   r.claim.settled_amount + r.claim.tds_amount,
    "Discrepancy (₹)":   r.metrics.amount,
    "Discrepancy %":     Number(r.metrics.pct.toFixed(2)),
    "Severity":          (r.metrics.band ?? "low").toUpperCase(),
    "Discrepancy (txt)": inrShort(r.metrics.amount),
    "Stage":             r.stage ?? "discrepancy",
    "Last action":       r.lastAction ?? "",
    "Last action at":    fmtDate(r.lastActionAt),
    "Emails sent":       r.emailsSent ?? 0,
    "TPA SPOC":          r.claim.tpa_spoc ?? "",
    "Hospital SPOC":     r.claim.hospital_spoc ?? "",
    "Remarks":           r.claim.remarks ?? "",
  }));
  const wsClaims = XLSX.utils.json_to_sheet(detail);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (wsClaims as any)["!cols"] = [
    { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 22 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 10 },
    { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 12 },
    { wch: 18 }, { wch: 18 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsClaims, "Claims");

  // ── Save ──────────────────────────────────────────────────────────
  const stamp = new Date().toISOString().slice(0, 10);
  const stage = (options.stageLabel ?? "discrepancy").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  XLSX.writeFile(wb, `discrepancy-${stage}-${stamp}.xlsx`);
}
