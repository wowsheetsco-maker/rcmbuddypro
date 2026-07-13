import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ChecklistItem } from "./appealChecklist";
import { reminderStatus } from "./appealChecklist";

export interface AppealExportMeta {
  patient: string;
  claimNumber: string;
  payer: string;
  denialCode: string;
  status: string;
  gapAmount: number;
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  overdue: "OVERDUE",
  due_soon: "Due soon",
  on_track: "On track",
  done: "Done",
  none: "—",
};

function safe(s: string): string {
  return (s ?? "").replace(/"/g, '""');
}

export function exportChecklistCsv(meta: AppealExportMeta, items: ChecklistItem[]): string {
  const lines: string[] = [];
  lines.push("Appeal checklist export");
  lines.push(`Patient,"${safe(meta.patient)}"`);
  lines.push(`Claim,"${safe(meta.claimNumber)}"`);
  lines.push(`Payer,"${safe(meta.payer)}"`);
  lines.push(`Denial code,"${safe(meta.denialCode)}"`);
  lines.push(`Status,"${safe(meta.status)}"`);
  lines.push(`Gap amount,${meta.gapAmount}`);
  lines.push(`Last updated,"${safe(meta.updatedAt)}"`);
  lines.push("");
  lines.push("Step,Action,Due date,Reminder,Done,Completed on");
  items.forEach((it, i) => {
    const status = STATUS_LABEL[reminderStatus(it)] ?? "—";
    lines.push([
      i + 1,
      `"${safe(it.text)}"`,
      it.dueAt ?? "",
      status,
      it.done ? "Yes" : "No",
      it.doneAt ? new Date(it.doneAt).toLocaleDateString() : "",
    ].join(","));
  });
  return lines.join("\n");
}

export function downloadChecklistCsv(meta: AppealExportMeta, items: ChecklistItem[]) {
  const csv = exportChecklistCsv(meta, items);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const fname = `appeal-${(meta.claimNumber || "checklist").replace(/[^\w-]+/g, "_")}.csv`;
  a.href = url; a.download = fname; a.click();
  URL.revokeObjectURL(url);
}

export function downloadChecklistPdf(meta: AppealExportMeta, items: ChecklistItem[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Appeal Checklist & Progress Summary", 40, 44);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90);
  doc.text(`Generated ${new Date().toLocaleString()}`, pageW - 40, 44, { align: "right" });
  doc.setTextColor(0);

  // Meta block
  const metaRows: [string, string][] = [
    ["Patient", meta.patient || "—"],
    ["Claim #", meta.claimNumber || "—"],
    ["Payer", meta.payer || "—"],
    ["Denial code", meta.denialCode || "—"],
    ["Appeal status", meta.status || "—"],
    ["Short-paid gap", `INR ${meta.gapAmount.toLocaleString("en-IN")}`],
    ["Last updated", meta.updatedAt || "—"],
  ];
  autoTable(doc, {
    startY: 60,
    body: metaRows,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 90, textColor: [90, 90, 90] },
      1: { cellWidth: pageW - 40 - 40 - 90 },
    },
    margin: { left: 40, right: 40 },
  });

  // Summary
  const done = items.filter((i) => i.done).length;
  const overdue = items.filter((i) => !i.done && reminderStatus(i) === "overdue").length;
  const dueSoon = items.filter((i) => !i.done && reminderStatus(i) === "due_soon").length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterMetaY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Progress: ${done}/${items.length} steps complete (${pct}%)  •  Overdue: ${overdue}  •  Due soon: ${dueSoon}`,
    40, afterMetaY,
  );

  // Checklist table
  const body = items.map((it, i) => [
    String(i + 1),
    it.text,
    it.dueAt ?? "—",
    STATUS_LABEL[reminderStatus(it)] ?? "—",
    it.done ? "Yes" : "No",
    it.doneAt ? new Date(it.doneAt).toLocaleDateString() : "—",
  ]);

  autoTable(doc, {
    startY: afterMetaY + 10,
    head: [["#", "Action", "Due", "Reminder", "Done", "Completed"]],
    body,
    styles: { fontSize: 8.5, cellPadding: 4, valign: "top" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 22, halign: "right" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 60 },
      3: { cellWidth: 60 },
      4: { cellWidth: 34, halign: "center" },
      5: { cellWidth: 60 },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      const it = items[data.row.index];
      if (!it) return;
      if (data.column.index === 3) {
        const s = reminderStatus(it);
        if (s === "overdue") data.cell.styles.textColor = [190, 30, 30];
        else if (s === "due_soon") data.cell.styles.textColor = [180, 110, 0];
        else if (s === "done") data.cell.styles.textColor = [30, 130, 60];
      }
      if (data.column.index === 1 && it.done) {
        data.cell.styles.textColor = [140, 140, 140];
      }
    },
    margin: { left: 40, right: 40 },
  });

  const fname = `appeal-${(meta.claimNumber || "checklist").replace(/[^\w-]+/g, "_")}.pdf`;
  doc.save(fname);
}
