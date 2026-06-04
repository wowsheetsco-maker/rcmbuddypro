import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface AuditEvent {
  id: string;
  action: string;
  channel: string | null;
  status: string;
  message: string | null;
  recipient: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  retry_count?: number | null;
  last_error?: string | null;
  resent_from_event_id?: string | null;
  created_at: string;
}

export interface AuditExportMeta {
  clientName?: string;
  providerName?: string;
  requestId?: string;
}

function fmt(d?: string | null) {
  return d ? new Date(d).toLocaleString() : "";
}

function rowsFor(events: AuditEvent[]) {
  return events.map((e) => ({
    "Timestamp": fmt(e.created_at),
    "Action": e.action.replaceAll("_", " "),
    "Channel": e.channel ?? "",
    "Status": e.status,
    "Recipient": e.recipient ?? "",
    "Delivered at": fmt(e.delivered_at),
    "Opened at": fmt(e.opened_at),
    "Retries": e.retry_count ?? 0,
    "Resent from": e.resent_from_event_id ? "yes" : "",
    "Error": e.last_error ?? "",
    "Message": (e.message ?? "").slice(0, 500),
  }));
}

export function exportAuditXlsx(events: AuditEvent[], meta: AuditExportMeta, filename?: string) {
  const wb = XLSX.utils.book_new();
  const header = [
    ["Wellness Request Audit Timeline"],
    ["Client", meta.clientName ?? ""],
    ["Provider", meta.providerName ?? ""],
    ["Request ID", meta.requestId ?? ""],
    ["Generated", new Date().toLocaleString()],
    [],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(header);
  XLSX.utils.sheet_add_json(sheet, rowsFor(events), { origin: -1 });
  XLSX.utils.book_append_sheet(wb, sheet, "Audit");
  XLSX.writeFile(wb, filename ?? `wellness-audit-${meta.clientName?.replace(/\s+/g, "_") ?? "request"}-${Date.now()}.xlsx`);
}

export function exportAuditPdf(events: AuditEvent[], meta: AuditExportMeta, filename?: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.text("Wellness Request Audit Timeline", 40, 40);
  doc.setFontSize(10);
  doc.text(`Client: ${meta.clientName ?? "—"}`, 40, 60);
  doc.text(`Provider: ${meta.providerName ?? "—"}`, 40, 74);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 88);

  autoTable(doc, {
    startY: 110,
    head: [["Timestamp", "Action", "Channel", "Status", "Recipient", "Delivered", "Retries", "Error"]],
    body: events.map((e) => [
      fmt(e.created_at),
      e.action.replaceAll("_", " "),
      e.channel ?? "",
      e.status,
      e.recipient ?? "",
      fmt(e.delivered_at),
      String(e.retry_count ?? 0),
      (e.last_error ?? "").slice(0, 80),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 0: { cellWidth: 110 }, 4: { cellWidth: 140 }, 7: { cellWidth: 160 } },
  });

  doc.save(filename ?? `wellness-audit-${meta.clientName?.replace(/\s+/g, "_") ?? "request"}-${Date.now()}.pdf`);
}
