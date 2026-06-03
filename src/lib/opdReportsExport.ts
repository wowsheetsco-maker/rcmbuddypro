import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ReportRow {
  beneficiary_name: string;
  stage: string;
  hours_open: number;
  rag: "green" | "amber" | "red";
  awaiting_since: string;
  sla_target_at: string | null;
  file_name: string | null;
  notes: string | null;
}

export interface SlaMetrics {
  open_24h: number;
  open_48h: number;
  open_72h: number;
  closed_today: number;
  total_open: number;
}

export function exportReportsXlsx(metrics: SlaMetrics, rows: ReportRow[], filename = `opd-sla-${Date.now()}.xlsx`) {
  const wb = XLSX.utils.book_new();

  const summary = [
    ["OPD Report SLA Dashboard"],
    ["Generated", new Date().toLocaleString()],
    [],
    ["Metric", "Count"],
    ["Total open", metrics.total_open],
    ["Open >24h (amber)", metrics.open_24h],
    ["Open >48h", metrics.open_48h],
    ["Open >72h (red)", metrics.open_72h],
    ["Closed today", metrics.closed_today],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");

  const detail = rows.map((r) => ({
    Beneficiary: r.beneficiary_name,
    Stage: r.stage,
    RAG: r.rag.toUpperCase(),
    "Hours open": r.hours_open,
    "Awaiting since": r.awaiting_since?.slice(0, 16).replace("T", " ") ?? "",
    "SLA target": r.sla_target_at?.slice(0, 16).replace("T", " ") ?? "",
    File: r.file_name ?? "",
    Notes: r.notes ?? "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "Pending reports");
  XLSX.writeFile(wb, filename);
}

export function exportReportsPdf(metrics: SlaMetrics, rows: ReportRow[], filename = `opd-sla-${Date.now()}.pdf`) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("OPD Report SLA Dashboard", 14, 14);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 20);

  autoTable(doc, {
    startY: 26,
    head: [["Metric", "Count"]],
    body: [
      ["Total open", metrics.total_open],
      ["Open >24h (amber)", metrics.open_24h],
      ["Open >48h", metrics.open_48h],
      ["Open >72h (RED)", metrics.open_72h],
      ["Closed today", metrics.closed_today],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
    tableWidth: 100,
  });

  const startY = (doc as any).lastAutoTable?.finalY ?? 50;
  autoTable(doc, {
    startY: startY + 8,
    head: [["Beneficiary", "Stage", "RAG", "Hours", "Awaiting since", "SLA target", "File"]],
    body: rows.map((r) => [
      r.beneficiary_name,
      r.stage,
      r.rag.toUpperCase(),
      r.hours_open,
      r.awaiting_since?.slice(0, 16).replace("T", " ") ?? "",
      r.sla_target_at?.slice(0, 16).replace("T", " ") ?? "",
      r.file_name ?? "—",
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        const v = String(data.cell.raw ?? "");
        if (v === "RED") data.cell.styles.fillColor = [254, 226, 226];
        else if (v === "AMBER") data.cell.styles.fillColor = [254, 243, 199];
        else if (v === "GREEN") data.cell.styles.fillColor = [220, 252, 231];
      }
    },
  });

  doc.save(filename);
}
