import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface InvoiceRow {
  invoice_no: string;
  corporate_name: string;
  period_start: string;
  period_end: string;
  visit_count: number;
  total_amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string;
  generated_at: string;
  submitted_at?: string | null;
}

export interface InvoiceLine {
  visit_date?: string;
  patient_name?: string;
  description?: string | null;
  amount: number;
}

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/** Bulk export — one row per invoice. */
export function exportInvoicesXlsx(rows: InvoiceRow[], filename = `opd-invoices-${Date.now()}.xlsx`) {
  const data = rows.map((r) => ({
    "Tracking #": r.invoice_no,
    "Invoice #": r.invoice_no,
    Corporate: r.corporate_name,
    "Period start": r.period_start,
    "Period end": r.period_end,
    Visits: r.visit_count,
    "Total (INR)": Number(r.total_amount),
    "Paid (INR)": Number(r.paid_amount),
    "Outstanding (INR)": Number(r.total_amount) - Number(r.paid_amount),
    "Due date": r.due_date ?? "",
    Status: r.status,
    Generated: r.generated_at?.slice(0, 10) ?? "",
    Submitted: r.submitted_at?.slice(0, 10) ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Invoices");
  XLSX.writeFile(wb, filename);
}

export function exportInvoicesPdf(rows: InvoiceRow[], filename = `opd-invoices-${Date.now()}.pdf`) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("OPD / Wellness Invoices", 14, 14);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()} · ${rows.length} invoice(s)`, 14, 20);
  autoTable(doc, {
    startY: 24,
    head: [["Tracking #", "Corporate", "Period", "Visits", "Total", "Paid", "Outstanding", "Due", "Status"]],
    body: rows.map((r) => [
      r.invoice_no,
      r.corporate_name,
      `${r.period_start} → ${r.period_end}`,
      r.visit_count,
      inr(r.total_amount),
      inr(r.paid_amount),
      inr(Number(r.total_amount) - Number(r.paid_amount)),
      r.due_date ?? "—",
      r.status,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [30, 41, 59] },
  });
  doc.save(filename);
}

/** Per-invoice export — invoice header + line items. */
export function exportSingleInvoiceXlsx(inv: InvoiceRow, lines: InvoiceLine[]) {
  const wb = XLSX.utils.book_new();
  const header = [
    ["Tracking #", inv.invoice_no],
    ["Invoice #", inv.invoice_no],
    ["Corporate", inv.corporate_name],
    ["Period", `${inv.period_start} → ${inv.period_end}`],
    ["Visits", inv.visit_count],
    ["Total", Number(inv.total_amount)],
    ["Paid", Number(inv.paid_amount)],
    ["Outstanding", Number(inv.total_amount) - Number(inv.paid_amount)],
    ["Due date", inv.due_date ?? ""],
    ["Status", inv.status],
    [],
  ];
  const linesData = lines.map((l) => ({
    Date: l.visit_date ?? "",
    Patient: l.patient_name ?? "",
    Description: l.description ?? "",
    Amount: Number(l.amount),
  }));
  const ws = XLSX.utils.aoa_to_sheet(header);
  XLSX.utils.sheet_add_json(ws, linesData, { origin: -1 });
  XLSX.utils.book_append_sheet(wb, ws, inv.invoice_no.slice(0, 28));
  XLSX.writeFile(wb, `${inv.invoice_no}.xlsx`);
}

export function exportSingleInvoicePdf(inv: InvoiceRow, lines: InvoiceLine[]) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Tax Invoice", 14, 16);
  doc.setFontSize(10);
  doc.text(`Invoice #: ${inv.invoice_no}`, 14, 26);
  doc.text(`Corporate: ${inv.corporate_name}`, 14, 32);
  doc.text(`Period: ${inv.period_start} → ${inv.period_end}`, 14, 38);
  doc.text(`Due: ${inv.due_date ?? "—"}`, 14, 44);
  doc.text(`Status: ${inv.status.toUpperCase()}`, 140, 26);
  doc.text(`Generated: ${(inv.generated_at ?? "").slice(0, 10)}`, 140, 32);

  autoTable(doc, {
    startY: 52,
    head: [["#", "Date", "Patient", "Description", "Amount"]],
    body: lines.length === 0
      ? [["—", "—", "—", "Visits aggregated", inr(inv.total_amount)]]
      : lines.map((l, i) => [i + 1, l.visit_date ?? "", l.patient_name ?? "", l.description ?? "", inr(l.amount)]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? 60;
  doc.setFontSize(11);
  doc.text(`Total: ${inr(inv.total_amount)}`, 140, finalY + 10);
  doc.text(`Paid:  ${inr(inv.paid_amount)}`, 140, finalY + 16);
  doc.setFont(undefined as any, "bold");
  doc.text(`Outstanding: ${inr(Number(inv.total_amount) - Number(inv.paid_amount))}`, 140, finalY + 24);

  doc.save(`${inv.invoice_no}.pdf`);
}
