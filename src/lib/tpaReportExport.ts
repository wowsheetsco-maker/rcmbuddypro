import * as XLSX from "xlsx";
import type { PayerStats, TalkingPoint } from "./payerScorecard";
import type { PayerBenchmarks } from "./payerBenchmarks";
import type { TrendPoint } from "./payerTrends";
import type { InsurerContactRow } from "@/hooks/useInsurerContacts";

interface ExportInput {
  payer: PayerStats;
  benchmarks: PayerBenchmarks;
  trend: TrendPoint[];
  points: TalkingPoint[];
  contact?: InsurerContactRow;
  view: "tpa" | "insurer";
}

const inrFmt = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Export the TPA Negotiation Report as a multi-sheet XLSX workbook. */
export function exportTpaReportXlsx({
  payer, benchmarks, trend, points, contact, view,
}: ExportInput) {
  const wb = XLSX.utils.book_new();

  // ─── Sheet 1: Summary ───────────────────────────────────
  const summary: (string | number)[][] = [
    ["TPA Negotiation Report"],
    [`Payer: ${payer.name}`, `Type: ${view === "tpa" ? "TPA" : "Insurer"}`],
    [`Generated: ${new Date().toLocaleString("en-IN")}`],
    [],
    ["Grade", payer.grade, "Score", `${payer.score}/100`, "Median Score", benchmarks.median.score],
  ];
  if (contact) {
    summary.push([], ["Primary Contact"]);
    summary.push(["Name", contact.contact_name]);
    summary.push(["Designation", contact.designation || "—"]);
    summary.push(["Email", contact.email]);
    if (contact.cc_emails) summary.push(["CC", contact.cc_emails]);
    if (contact.phone) summary.push(["Phone", contact.phone]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1["!cols"] = [{ wch: 22 }, { wch: 36 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Summary");

  // ─── Sheet 2: KPIs vs Benchmark ─────────────────────────
  const kpiRows: (string | number)[][] = [
    ["Metric", "Payer Value", "Portfolio Median", "Delta", "Notes"],
    ["Total Claims", payer.claims, benchmarks.median.claims, payer.claims - benchmarks.median.claims, "Volume drives weight"],
    ["Unique Patients", payer.uniquePatients, benchmarks.median.uniquePatients, payer.uniquePatients - benchmarks.median.uniquePatients, ""],
    ["Total Claimed (₹)", payer.claimed, "", "", ""],
    ["Total Approved (₹)", payer.approved, "", "", ""],
    ["Total Settled (₹)", payer.settled, "", "", ""],
    ["TDS Withheld (₹)", payer.tds, "", "", ""],
    ["Outstanding (₹)", payer.outstanding, "", "", ""],
    ["Approval Rate (%)", payer.approvalPct, benchmarks.median.approvalPct,
      +(payer.approvalPct - benchmarks.median.approvalPct).toFixed(1), "Higher is better"],
    ["Net Realisation (%)", payer.netRealPct, benchmarks.median.netRealPct,
      +(payer.netRealPct - benchmarks.median.netRealPct).toFixed(1), "Higher is better"],
    ["Discrepancy (%)", payer.discPct, benchmarks.median.discPct,
      +(payer.discPct - benchmarks.median.discPct).toFixed(1), "Lower is better"],
    ["Avg Settlement TAT (days)", payer.avgTat || 0, benchmarks.median.avgTat,
      payer.avgTat && benchmarks.median.avgTat ? payer.avgTat - benchmarks.median.avgTat : 0, "SLA mandates 30d"],
    ["SLA Breaches", payer.irdaiBreach, "", "", "Open claims beyond 30d"],
    ["Denial Rate (%)", payer.denialPct, "", "", ""],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(kpiRows);
  ws2["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, ws2, "KPIs vs Benchmark");

  // ─── Sheet 3: 6-month trend ─────────────────────────────
  const trendRows: (string | number)[][] = [
    ["Month", "Claims", "Approved (₹)", "Settled (₹)", "Net Realisation (%)"],
    ...trend.map((t) => [t.label, t.claims, t.approved, t.settled, t.netRealPct]),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(trendRows);
  ws3["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws3, "6-Month Trend");

  // ─── Sheet 4: Talking Points ────────────────────────────
  const pointRows: (string | number)[][] = [
    ["#", "Severity", "Title", "Detail"],
    ...points.map((p, i) => [i + 1, p.severity.toUpperCase(), p.title, p.detail]),
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(pointRows);
  ws4["!cols"] = [{ wch: 4 }, { wch: 10 }, { wch: 60 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, ws4, "Talking Points");

  const safeName = payer.name.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `TPA_Report_${safeName}_${stamp}.xlsx`);
}

/**
 * Trigger the browser's print-to-PDF dialog. Print CSS hides the app chrome
 * so the report renders as a clean A4 document.
 */
export function exportTpaReportPdf() {
  window.print();
}

/** Helper exposed for unit testing of the INR formatter shape. */
export const _testHelpers = { inrFmt };
