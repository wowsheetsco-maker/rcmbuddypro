import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface MonthlyPdfLine {
  visit_date?: string | null;
  patient_name?: string | null;
  description?: string | null;
  amount: number;
}

export interface MonthlyPdfInvoice {
  invoice_no: string;
  corporate_name: string;
  period_start: string;
  period_end: string;
  visit_count: number;
  total_amount: number;
  paid_amount: number;
  status: string;
  lines: MonthlyPdfLine[];
}

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

/**
 * Management-ready monthly invoice PDF: cover page with provider totals,
 * followed by a per-invoice section with full case line items.
 */
export function exportMonthlyManagementPdf(
  month: string,
  invoices: MonthlyPdfInvoice[],
  filename?: string,
) {
  const doc = new jsPDF({ orientation: "landscape" });
  const totalCases = invoices.reduce((s, i) => s + i.visit_count, 0);
  const totalAmount = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalPaid = invoices.reduce((s, i) => s + Number(i.paid_amount || 0), 0);

  doc.setFontSize(16);
  doc.text("Wellness — Monthly Invoice Report", 14, 16);
  doc.setFontSize(10);
  doc.text(`Month: ${month}`, 14, 24);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
  doc.text(
    `Providers: ${invoices.length}   Cases: ${totalCases}   Total: ${inr(totalAmount)}   Paid: ${inr(totalPaid)}   Outstanding: ${inr(totalAmount - totalPaid)}`,
    14,
    36,
  );

  autoTable(doc, {
    startY: 42,
    head: [["Tracking #", "Provider", "Period", "Cases", "Total", "Paid", "Outstanding", "Status"]],
    body: invoices.map((i) => [
      i.invoice_no,
      i.corporate_name,
      `${i.period_start} → ${i.period_end}`,
      i.visit_count,
      inr(i.total_amount),
      inr(i.paid_amount),
      inr(Number(i.total_amount) - Number(i.paid_amount)),
      i.status,
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  // Per-invoice detail pages
  for (const inv of invoices) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text(`Invoice ${inv.invoice_no} — ${inv.corporate_name}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Period: ${inv.period_start} → ${inv.period_end}`, 14, 22);
    doc.text(`Cases: ${inv.visit_count}   Total: ${inr(inv.total_amount)}   Status: ${inv.status}`, 14, 28);

    autoTable(doc, {
      startY: 34,
      head: [["#", "Date", "Patient / Case", "Description", "Amount"]],
      body: inv.lines.length === 0
        ? [["—", "—", "—", "Aggregated cases", inr(inv.total_amount)]]
        : inv.lines.map((l, idx) => [
            idx + 1,
            l.visit_date ?? "",
            l.patient_name ?? "",
            l.description ?? "",
            inr(l.amount),
          ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    });
  }

  doc.save(filename ?? `wellness-monthly-${month}.pdf`);
}
