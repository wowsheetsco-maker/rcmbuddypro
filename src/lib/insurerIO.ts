// Excel / CSV import & export helpers for TPA / Insurer master data.
// Flattens the InsurerProfile shape (incl. L1/L2/L3 escalation contacts and
// hospital SPOC) into one row per provider for spreadsheet round-tripping.

import * as XLSX from "xlsx";
import { insurerProfiles, type InsurerProfile, type Relation } from "@/data/insurerProfiles";

type FlatRow = Record<string, string | number>;

const RELATIONS: Relation[] = ["Excellent", "Good", "Average", "Strained"];

export function flattenProfiles(profiles: InsurerProfile[]): FlatRow[] {
  return profiles.map((p) => {
    const [l1, l2, l3] = p.escalationMatrix;
    return {
      ID: p.id,
      Name: p.name,
      Type: p.type,
      Status: p.status,
      Relation: p.relation,
      "Open Claims": p.openClaims,
      "Outstanding (INR)": p.outstanding,
      "Avg TAT (d)": p.avgTat,
      "Payment TAT (d)": p.paymentTat,
      "HO Address": p.hoAddress,
      "Branch Address": p.branchAddress,
      "Doc Submission Address": p.docSubmissionAddress,
      "Submission Mode": p.submissionMode,
      Helpline: p.helplineNumber,
      "Portal URL": p.portalUrl,
      "MOU Start": p.mouStart,
      "MOU End": p.mouEnd,
      "Tariff Effective": p.tariffEffective,
      "Tariff Renewal": p.tariffRenewal,
      "L1 Name": l1?.name ?? "",
      "L1 Designation": l1?.designation ?? "",
      "L1 Email": l1?.email ?? "",
      "L1 Phone": l1?.phone ?? "",
      "L1 SLA (h)": l1?.responseHours ?? "",
      "L2 Name": l2?.name ?? "",
      "L2 Designation": l2?.designation ?? "",
      "L2 Email": l2?.email ?? "",
      "L2 Phone": l2?.phone ?? "",
      "L2 SLA (h)": l2?.responseHours ?? "",
      "L3 Name": l3?.name ?? "",
      "L3 Designation": l3?.designation ?? "",
      "L3 Email": l3?.email ?? "",
      "L3 Phone": l3?.phone ?? "",
      "L3 SLA (h)": l3?.responseHours ?? "",
      "SPOC Name": p.hospitalSpoc.name,
      "SPOC Role": p.hospitalSpoc.role,
      "SPOC Email": p.hospitalSpoc.email,
      "SPOC Phone": p.hospitalSpoc.phone,
      "Portal Username": p.portalCredentials?.username ?? "",
      "Portal Password": p.portalCredentials?.password ?? "",
      "Portal Last Rotated": p.portalCredentials?.lastRotated ?? "",
    };
  });
}

export function exportProfiles(format: "xlsx" | "csv", profiles: InsurerProfile[] = insurerProfiles) {
  const rows = flattenProfiles(profiles);
  const ws = XLSX.utils.json_to_sheet(rows);
  // Auto-fit column widths (rough heuristic)
  const cols = Object.keys(rows[0] ?? {}).map((k) => ({
    wch: Math.min(40, Math.max(k.length + 2, ...rows.map((r) => String(r[k] ?? "").length + 2))),
  }));
  ws["!cols"] = cols;

  const ts = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    triggerDownload(blob, `tpa-insurers-${ts}.csv`);
  } else {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TPA & Insurers");
    XLSX.writeFile(wb, `tpa-insurers-${ts}.xlsx`);
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  parsed: InsurerProfile[];
  errors: string[];
  total: number;
}

export type MergeKey = "id" | "name";

export interface FieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface MergePreviewRow {
  incoming: InsurerProfile;
  existing?: InsurerProfile;
  action: "insert" | "update" | "noop";
  diffs: FieldDiff[];
}

export interface MergePreview {
  rows: MergePreviewRow[];
  inserts: number;
  updates: number;
  noops: number;
  duplicateKeys: string[];
}

const COMPARE_FIELDS: { key: keyof InsurerProfile; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "relation", label: "Relation" },
  { key: "openClaims", label: "Open Claims" },
  { key: "outstanding", label: "Outstanding" },
  { key: "avgTat", label: "Avg TAT" },
  { key: "paymentTat", label: "Payment TAT" },
  { key: "hoAddress", label: "HO Address" },
  { key: "branchAddress", label: "Branch Address" },
  { key: "submissionMode", label: "Submission Mode" },
  { key: "helplineNumber", label: "Helpline" },
  { key: "portalUrl", label: "Portal URL" },
  { key: "mouStart", label: "MOU Start" },
  { key: "mouEnd", label: "MOU End" },
  { key: "tariffEffective", label: "Tariff Effective" },
  { key: "tariffRenewal", label: "Tariff Renewal" },
];

function keyOf(p: InsurerProfile, mergeKey: MergeKey): string {
  return mergeKey === "id" ? String(p.id) : p.name.trim().toLowerCase();
}

export function computeMergePreview(
  existing: InsurerProfile[],
  incoming: InsurerProfile[],
  mergeKey: MergeKey,
): MergePreview {
  const existingByKey = new Map<string, InsurerProfile>();
  existing.forEach((p) => existingByKey.set(keyOf(p, mergeKey), p));

  const seen = new Map<string, number>();
  const rows: MergePreviewRow[] = incoming.map((inc) => {
    const k = keyOf(inc, mergeKey);
    seen.set(k, (seen.get(k) ?? 0) + 1);
    const match = existingByKey.get(k);
    if (!match) {
      return { incoming: inc, action: "insert", diffs: [] };
    }
    const diffs: FieldDiff[] = [];
    for (const f of COMPARE_FIELDS) {
      const before = String(match[f.key] ?? "");
      const after = String(inc[f.key] ?? "");
      if (before !== after && after !== "") {
        diffs.push({ field: f.label, before, after });
      }
    }
    // Compare escalation L1 contact (representative nested check)
    const beforeL1 = match.escalationMatrix[0];
    const afterL1 = inc.escalationMatrix[0];
    if (afterL1 && (beforeL1?.email !== afterL1.email || beforeL1?.phone !== afterL1.phone)) {
      diffs.push({
        field: "L1 Contact",
        before: beforeL1 ? `${beforeL1.email} / ${beforeL1.phone}` : "—",
        after: `${afterL1.email} / ${afterL1.phone}`,
      });
    }
    return {
      incoming: inc,
      existing: match,
      action: diffs.length ? "update" : "noop",
      diffs,
    };
  });

  const duplicateKeys = Array.from(seen.entries())
    .filter(([, n]) => n > 1)
    .map(([k]) => k);

  return {
    rows,
    inserts: rows.filter((r) => r.action === "insert").length,
    updates: rows.filter((r) => r.action === "update").length,
    noops: rows.filter((r) => r.action === "noop").length,
    duplicateKeys,
  };
}

export function applyMerge(
  existing: InsurerProfile[],
  incoming: InsurerProfile[],
  mergeKey: MergeKey,
): InsurerProfile[] {
  const map = new Map<string, InsurerProfile>();
  existing.forEach((p) => map.set(keyOf(p, mergeKey), p));
  incoming.forEach((p) => {
    const k = keyOf(p, mergeKey);
    const prev = map.get(k);
    // Preserve existing ID when merging by name so we don't fragment records
    const merged: InsurerProfile = prev
      ? { ...prev, ...p, id: mergeKey === "name" ? prev.id : p.id }
      : p;
    map.set(k, merged);
  });
  return Array.from(map.values());
}

export async function parseImportFile(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<FlatRow>(ws, { defval: "" });

  const errors: string[] = [];
  const parsed: InsurerProfile[] = [];

  rows.forEach((r, idx) => {
    const rowNum = idx + 2; // header + 1-based
    const name = String(r["Name"] ?? "").trim();
    if (!name) {
      errors.push(`Row ${rowNum}: missing Name`);
      return;
    }
    const type = String(r["Type"] ?? "tpa").toLowerCase() as "tpa" | "insurer";
    if (type !== "tpa" && type !== "insurer") {
      errors.push(`Row ${rowNum}: Type must be "tpa" or "insurer"`);
      return;
    }
    const relation = (RELATIONS.includes(r["Relation"] as Relation) ? r["Relation"] : "Good") as Relation;

    parsed.push({
      id: Number(r["ID"]) || Date.now() + idx,
      name,
      type,
      status: (String(r["Status"] ?? "active") as InsurerProfile["status"]),
      relation,
      openClaims: Number(r["Open Claims"]) || 0,
      outstanding: Number(r["Outstanding (INR)"]) || 0,
      avgTat: Number(r["Avg TAT (d)"]) || 0,
      paymentTat: Number(r["Payment TAT (d)"]) || 30,
      hoAddress: String(r["HO Address"] ?? ""),
      branchAddress: String(r["Branch Address"] ?? ""),
      docSubmissionAddress: String(r["Doc Submission Address"] ?? ""),
      submissionMode: (String(r["Submission Mode"] ?? "Email") as InsurerProfile["submissionMode"]),
      helplineNumber: String(r["Helpline"] ?? ""),
      portalUrl: String(r["Portal URL"] ?? ""),
      mouStart: String(r["MOU Start"] ?? ""),
      mouEnd: String(r["MOU End"] ?? ""),
      tariffEffective: String(r["Tariff Effective"] ?? ""),
      tariffRenewal: String(r["Tariff Renewal"] ?? ""),
      escalationMatrix: (["L1", "L2", "L3"] as const)
        .map((lvl) => ({
          level: lvl,
          name: String(r[`${lvl} Name`] ?? ""),
          designation: String(r[`${lvl} Designation`] ?? ""),
          email: String(r[`${lvl} Email`] ?? ""),
          phone: String(r[`${lvl} Phone`] ?? ""),
          responseHours: Number(r[`${lvl} SLA (h)`]) || 24,
        }))
        .filter((c) => c.name),
      hospitalSpoc: {
        name: String(r["SPOC Name"] ?? ""),
        role: String(r["SPOC Role"] ?? ""),
        email: String(r["SPOC Email"] ?? ""),
        phone: String(r["SPOC Phone"] ?? ""),
      },
      lastVisit: null,
      documents: [],
      escalations: [],
      portalCredentials: r["Portal Username"]
        ? {
            username: String(r["Portal Username"]),
            password: String(r["Portal Password"] ?? ""),
            lastRotated: String(r["Portal Last Rotated"] ?? new Date().toISOString().slice(0, 10)),
          }
        : undefined,
    });
  });

  return { parsed, errors, total: rows.length };
}

export function downloadTemplate() {
  const sample = flattenProfiles(insurerProfiles.slice(0, 1));
  const ws = XLSX.utils.json_to_sheet(sample);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, "tpa-insurers-template.xlsx");
}
