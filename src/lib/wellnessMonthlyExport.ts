import * as XLSX from "xlsx";

export interface MonthlyCaseRow {
  case_id: string;
  client_name: string;
  client_email?: string | null;
  client_phone?: string | null;
  provider: string;
  package: string;
  status: string;
  requested_at: string;
  scheduled_at?: string | null;
  amount: number;
  invoice_no?: string | null;
  invoice_status?: string | null;
  link_status?: string | null;
}

const inr = (n: number) => Math.round(Number(n) || 0);

export function exportMonthlyInvoiceXlsx(month: string, rows: MonthlyCaseRow[], filename?: string) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const byProvider = new Map<string, { count: number; total: number; invoiced: number; paid: number }>();
  for (const r of rows) {
    const k = r.provider || "—";
    const cur = byProvider.get(k) ?? { count: 0, total: 0, invoiced: 0, paid: 0 };
    cur.count += 1;
    cur.total += Number(r.amount) || 0;
    if (r.link_status === "invoiced" || r.link_status === "submitted") cur.invoiced += Number(r.amount) || 0;
    if (r.link_status === "paid") cur.paid += Number(r.amount) || 0;
    byProvider.set(k, cur);
  }

  const summary = [
    ["Wellness Monthly Invoice Report"],
    ["Month", month],
    ["Generated", new Date().toLocaleString()],
    ["Total cases", rows.length],
    ["Total amount", rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)],
    [],
    ["Provider", "Cases", "Total (INR)", "Invoiced (INR)", "Paid (INR)"],
    ...Array.from(byProvider.entries()).map(([p, v]) => [p, v.count, inr(v.total), inr(v.invoiced), inr(v.paid)]),
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // Cases sheet
  const data = rows.map((r) => ({
    "Case ID": r.case_id.slice(0, 8),
    "Client": r.client_name,
    "Email": r.client_email ?? "",
    "Phone": r.client_phone ?? "",
    "Provider": r.provider,
    "Package": r.package,
    "Case Status": r.status,
    "Requested": r.requested_at?.slice(0, 10) ?? "",
    "Scheduled": r.scheduled_at?.slice(0, 10) ?? "",
    "Amount (INR)": inr(r.amount),
    "Invoice #": r.invoice_no ?? "",
    "Invoice Status": r.invoice_status ?? "",
    "Link Status": r.link_status ?? "pending",
  }));
  const casesSheet = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, casesSheet, "Cases");

  XLSX.writeFile(wb, filename ?? `wellness-monthly-${month}.xlsx`);
}
