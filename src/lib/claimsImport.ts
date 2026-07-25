// Maps the IHX 43-column claim sheet template into rows ready for upsert into
// the `claims` table. Handles Excel date serials, header normalisation,
// numeric parsing, and produces validation errors per row.

import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { splitHospitalName, slugifyGroupName } from "@/lib/hospitalNameSplit";

/** Database row shape we will upsert (keys match `claims` table columns). */
export interface ClaimUpsertRow {
  claim_number: string;
  patient_name: string;
  tpa_name: string;
  claim_status: string;
  claim_creation_date: string; // YYYY-MM-DD (NOT NULL in DB)
  initial_claim_number: string | null;
  ihx_ref_id: string | null;
  hospital_name: string | null;
  patient_contact: string | null;
  in_patient_number: string | null;
  member_customer_id: string | null;
  date_of_admission: string | null;
  date_of_discharge: string | null;
  insurance_company_name: string | null;
  policy_number: string | null;
  claimed_amount: number;
  approved_amount: number;
  copay: number;
  shortfall_amount: number;
  hospital_discount: number;
  patient_paid_amount: number;
  settled_amount: number;
  tds_amount: number;
  cheque_neft_utr_no: string | null;
  cheque_neft_utr_date: string | null;
  receipt_no: string | null;
  doc_submission_date: string | null;
  payment_update_date: string | null;
  treatment: string | null;
  diagnosis: string | null;
  policy_type: string | null;
  policy_holder_name: string | null;
  employee_code: string | null;
  insurer_comments: string | null;
  outstanding_amount: number;
  is_irdai_breach: boolean;
  hospital_group_id: string | null;
  hospital_branch_id: string | null;
  treating_doctor: string | null;
  ward: string | null;
  coder_name: string | null;
  tpa_spoc: string | null;
  hospital_spoc: string | null;
  remarks: string | null;
}

export interface ParseError {
  row: number; // 1-based row in the sheet (excluding header)
  field: string;
  message: string;
}

export interface ParseResult {
  rows: ClaimUpsertRow[];
  errors: ParseError[];
  totalRows: number;
  detectedHeaders: string[];
  unmappedHeaders: string[];
}

// --- Header mapping (template → DB column) -----------------------------------
const HEADER_MAP: Record<string, keyof ClaimUpsertRow | "_skip"> = {
  "ihx ref id": "ihx_ref_id",
  "hospital name": "hospital_name",
  "rohiniid": "_skip",
  "patient name": "patient_name",
  "patient contact": "patient_contact",
  "in patient number": "in_patient_number",
  "member/customer id": "member_customer_id",
  "date of admission": "date_of_admission",
  "date of discharge": "date_of_discharge",
  "tpa name": "tpa_name",
  "insurance company name": "insurance_company_name",
  "policy number": "policy_number",
  "claim number": "claim_number",
  "initial claim number": "initial_claim_number",
  "claim creation date": "claim_creation_date",
  "claimed amount": "claimed_amount",
  "approved amount": "approved_amount",
  "copay": "copay",
  "shortfall amount": "shortfall_amount",
  "hospital discount": "hospital_discount",
  "patient paid amount": "patient_paid_amount",
  "settled amount": "settled_amount",
  "tds amount": "tds_amount",
  "cheque/ neft/ utr no.": "cheque_neft_utr_no",
  "cheque/neft/utr no": "cheque_neft_utr_no",
  "cheque/ neft/ utr date": "cheque_neft_utr_date",
  "cheque/neft/utr date": "cheque_neft_utr_date",
  "receiptno": "receipt_no",
  "claim status": "claim_status",
  "document submission date (on ihx)": "doc_submission_date",
  "document submission date": "doc_submission_date",
  "payment update date": "payment_update_date",
  "treatment": "treatment",
  "diagnosis": "diagnosis",
  "policy type (base/top-up)": "policy_type",
  "policy type": "policy_type",
  "policy holder name": "policy_holder_name",
  "employee code": "employee_code",
  "insurercomments": "insurer_comments",
  "insurer comments": "insurer_comments",
  "treating doctor": "treating_doctor",
  "doctor name": "treating_doctor",
  "consultant": "treating_doctor",
  "ward": "ward",
  "ward name": "ward",
  "room type": "ward",
  "coder": "coder_name",
  "coder name": "coder_name",
  "medical coder": "coder_name",
  "tpa spoc": "tpa_spoc",
  "tpa contact": "tpa_spoc",
  "tpa email": "tpa_spoc",
  "hospital spoc": "hospital_spoc",
  "insurance coordinator": "hospital_spoc",
  "remarks": "remarks",
  "notes": "remarks",
  // The remaining columns (UHID, InvoiceNumber, Courier *) are not stored —
  // intentionally absent from the map so we report them as "ignored".
};

const NUMERIC_FIELDS: ReadonlySet<keyof ClaimUpsertRow> = new Set([
  "claimed_amount",
  "approved_amount",
  "copay",
  "shortfall_amount",
  "hospital_discount",
  "patient_paid_amount",
  "settled_amount",
  "tds_amount",
] as (keyof ClaimUpsertRow)[]);

const DATE_FIELDS: ReadonlySet<keyof ClaimUpsertRow> = new Set([
  "claim_creation_date",
  "date_of_admission",
  "date_of_discharge",
  "cheque_neft_utr_date",
  "doc_submission_date",
  "payment_update_date",
] as (keyof ClaimUpsertRow)[]);

const REQUIRED_FIELDS: (keyof ClaimUpsertRow)[] = [
  "claim_number",
  "patient_name",
  "tpa_name",
  "claim_status",
  "claim_creation_date",
];

function normaliseHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseExcelDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  // Excel serial number (date stored as number)
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    const yyyy = String(d.y).padStart(4, "0");
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  // String — try a few common patterns
  const str = String(value).trim();
  if (!str) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // DD/MM/YYYY or DD-MM-YYYY
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Last resort
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[,\s₹]/g, "").trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

/** Days between today and a YYYY-MM-DD date string. */
function daysSince(dateStr: string): number {
  const start = new Date(`${dateStr}T00:00:00Z`).getTime();
  const today = new Date().setUTCHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - start) / 86_400_000));
}

const SETTLED_STATUSES = new Set([
  "settled",
  "paid",
  "closed",
  "rejected",
  "denied",
]);

/** Parse a raw worksheet object (array of row objects) into upsert-ready rows. */
function buildRow(
  raw: Record<string, unknown>,
  headerToField: Map<string, keyof ClaimUpsertRow>,
  rowIndex: number,
  errors: ParseError[],
): ClaimUpsertRow | null {
  const row: Partial<ClaimUpsertRow> = {
    is_irdai_breach: false,
    hospital_group_id: null,
    hospital_branch_id: null,
  };

  for (const [origHeader, value] of Object.entries(raw)) {
    const field = headerToField.get(normaliseHeader(origHeader));
    if (!field) continue;

    if (DATE_FIELDS.has(field)) {
      const parsed = parseExcelDate(value);
      (row as any)[field] = parsed;
    } else if (NUMERIC_FIELDS.has(field)) {
      (row as any)[field] = parseNumber(value);
    } else {
      (row as any)[field] = toStr(value);
    }
  }

  // Required field validation
  for (const f of REQUIRED_FIELDS) {
    const v = row[f];
    if (v === null || v === undefined || v === "") {
      errors.push({
        row: rowIndex,
        field: f,
        message: `Missing required value for ${f.replace(/_/g, " ")}`,
      });
    }
  }
  if (errors.some((e) => e.row === rowIndex)) return null;

  // Derived: outstanding_amount = approved - settled - tds (clamped).
  // Denied/rejected claims and claims with no approved amount contribute 0.
  const approved = row.approved_amount ?? 0;
  const settled = row.settled_amount ?? 0;
  const tds = row.tds_amount ?? 0;
  const status = (row.claim_status ?? "").toLowerCase();
  const isDenied = /denied|rejected|repudiat/i.test(status);
  const outstanding =
    SETTLED_STATUSES.has(status) || isDenied || approved <= 0
      ? 0
      : Math.max(0, approved - settled - tds);
  row.outstanding_amount = outstanding;

  // Derived: SLA breach = outstanding > 0 AND age > 15 days from claim creation
  if (outstanding > 0 && row.claim_creation_date) {
    row.is_irdai_breach = daysSince(row.claim_creation_date) > 15;
  }

  // Fill defaults for nullable string fields not present in sheet
  const nullableStrFields: (keyof ClaimUpsertRow)[] = [
    "initial_claim_number",
    "ihx_ref_id",
    "hospital_name",
    "patient_contact",
    "in_patient_number",
    "member_customer_id",
    "date_of_admission",
    "date_of_discharge",
    "insurance_company_name",
    "policy_number",
    "cheque_neft_utr_no",
    "cheque_neft_utr_date",
    "receipt_no",
    "doc_submission_date",
    "payment_update_date",
    "treatment",
    "diagnosis",
    "policy_type",
    "policy_holder_name",
    "employee_code",
    "insurer_comments",
  ];
  for (const f of nullableStrFields) {
    if (row[f] === undefined) (row as any)[f] = null;
  }

  // Fill defaults for nullable numeric fields
  const numericDefaults: (keyof ClaimUpsertRow)[] = [
    "claimed_amount",
    "approved_amount",
    "copay",
    "shortfall_amount",
    "hospital_discount",
    "patient_paid_amount",
    "settled_amount",
    "tds_amount",
  ];
  for (const f of numericDefaults) {
    if (row[f] === undefined) (row as any)[f] = 0;
  }

  return row as ClaimUpsertRow;
}

export async function parseClaimsFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) {
    return {
      rows: [],
      errors: [{ row: 0, field: "_file", message: "No sheets found in workbook" }],
      totalRows: 0,
      detectedHeaders: [],
      unmappedHeaders: [],
    };
  }
  const ws = wb.Sheets[firstSheet];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: true,
  });

  const detectedHeaders = raw.length > 0 ? Object.keys(raw[0]) : [];
  const headerToField = new Map<string, keyof ClaimUpsertRow>();
  const unmappedHeaders: string[] = [];
  for (const h of detectedHeaders) {
    const norm = normaliseHeader(h);
    const target = HEADER_MAP[norm];
    if (target && target !== "_skip") {
      headerToField.set(norm, target);
    } else if (target !== "_skip") {
      unmappedHeaders.push(h);
    }
  }

  const errors: ParseError[] = [];
  const rows: ClaimUpsertRow[] = [];
  raw.forEach((r, i) => {
    // Skip completely empty rows
    if (Object.values(r).every((v) => v === null || v === "")) return;
    const built = buildRow(r, headerToField, i + 1, errors);
    if (built) rows.push(built);
  });

  return {
    rows,
    errors,
    totalRows: raw.length,
    detectedHeaders,
    unmappedHeaders,
  };
}

// ---------------------------------------------------------------------------
// Multi-branch enrichment
// ---------------------------------------------------------------------------

interface EnrichSummary {
  /** Number of new hospital groups created during this import. */
  groupsCreated: number;
  /** Number of new branches created during this import. */
  branchesCreated: number;
  /** Number of rows that received a (group, branch) tag. */
  rowsTagged: number;
}

/**
 * Walks the parsed rows, splits each `hospital_name` into a (group, branch),
 * upserts any missing groups/branches into the DB, and writes the resolved
 * `hospital_group_id` / `hospital_branch_id` back onto each row.
 *
 * Mutates the rows in place AND returns a summary for the import preview.
 */
export async function enrichRowsWithBranchIds(
  rows: ClaimUpsertRow[],
): Promise<EnrichSummary> {
  if (rows.length === 0) {
    return { groupsCreated: 0, branchesCreated: 0, rowsTagged: 0 };
  }

  // 1. Compute (group, branch) pairs for every row
  type Pair = { group: string; branch: string; raw: string };
  const pairs: (Pair | null)[] = rows.map((r) => {
    const raw = (r.hospital_name ?? "").trim();
    if (!raw) return null;
    const { group, branch } = splitHospitalName(raw);
    return { group, branch, raw };
  });

  const distinctGroups = Array.from(
    new Set(pairs.filter((p): p is Pair => !!p).map((p) => p.group)),
  );
  if (distinctGroups.length === 0) {
    return { groupsCreated: 0, branchesCreated: 0, rowsTagged: 0 };
  }

  // 2. Load existing groups for those names
  const { data: existingGroups } = await supabase
    .from("hospital_groups")
    .select("id, name")
    .in("name", distinctGroups);
  const groupByName = new Map<string, string>();
  (existingGroups ?? []).forEach((g) => groupByName.set(g.name, g.id));

  // 3. Insert any missing groups
  const { getCurrentOrgId } = await import("@/lib/currentOrg");
  const _orgId = getCurrentOrgId();
  const missingGroupRows = distinctGroups
    .filter((name) => !groupByName.has(name))
    .map((name) => ({ org_id: _orgId, name, slug: slugifyGroupName(name) || name.toLowerCase() }));
  let groupsCreated = 0;
  if (missingGroupRows.length > 0) {
    const { data: inserted } = await supabase
      .from("hospital_groups")
      .insert(missingGroupRows)
      .select("id, name");
    (inserted ?? []).forEach((g) => groupByName.set(g.name, g.id));
    groupsCreated = inserted?.length ?? 0;
  }

  // 4. Compute distinct (group_id, branch_name) pairs and load existing branches
  const branchPairs = Array.from(
    new Set(
      pairs
        .filter((p): p is Pair => !!p)
        .map((p) => `${groupByName.get(p.group) ?? ""}::${p.branch}`),
    ),
  )
    .map((s) => s.split("::"))
    .filter(([gid]) => !!gid)
    .map(([group_id, name]) => ({ group_id, name }));

  const branchKey = (gid: string, name: string) => `${gid}::${name}`;
  const branchByKey = new Map<string, string>();

  if (branchPairs.length > 0) {
    // We can't easily filter by tuple, so fetch branches for each affected group_id.
    const distinctGids = Array.from(new Set(branchPairs.map((b) => b.group_id)));
    const { data: existingBranches } = await supabase
      .from("hospital_branches")
      .select("id, group_id, name")
      .in("group_id", distinctGids);
    (existingBranches ?? []).forEach((b) =>
      branchByKey.set(branchKey(b.group_id, b.name), b.id),
    );
  }

  // 5. Insert missing branches (with raw_name from the first matching row)
  const rawByKey = new Map<string, string>();
  pairs.forEach((p) => {
    if (!p) return;
    const gid = groupByName.get(p.group);
    if (!gid) return;
    const k = branchKey(gid, p.branch);
    if (!rawByKey.has(k)) rawByKey.set(k, p.raw);
  });
  const missingBranchRows = branchPairs
    .filter((b) => !branchByKey.has(branchKey(b.group_id, b.name)))
    .map((b) => ({
      org_id: _orgId,
      group_id: b.group_id,
      name: b.name,
      raw_name: rawByKey.get(branchKey(b.group_id, b.name)) ?? null,
    }));
  let branchesCreated = 0;
  if (missingBranchRows.length > 0) {
    const { data: insertedBranches } = await supabase
      .from("hospital_branches")
      .insert(missingBranchRows)
      .select("id, group_id, name");
    (insertedBranches ?? []).forEach((b) =>
      branchByKey.set(branchKey(b.group_id, b.name), b.id),
    );
    branchesCreated = insertedBranches?.length ?? 0;
  }

  // 6. Tag each row
  let rowsTagged = 0;
  pairs.forEach((p, i) => {
    if (!p) return;
    const gid = groupByName.get(p.group) ?? null;
    const bid = gid ? branchByKey.get(branchKey(gid, p.branch)) ?? null : null;
    rows[i].hospital_group_id = gid;
    rows[i].hospital_branch_id = bid;
    if (gid && bid) rowsTagged += 1;
  });

  return { groupsCreated, branchesCreated, rowsTagged };
}
