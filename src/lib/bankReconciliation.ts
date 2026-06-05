/**
 * Bank statement parser + auto-matcher.
 *
 * Pure TS, no external service. Accepts CSV / XLSX bank statements,
 * normalises rows, extracts UTR / UPI references from narration, and
 * scores matches against the claims table.
 */
import * as XLSX from "xlsx";

export interface ParsedBankRow {
  txn_date: string | null;
  value_date: string | null;
  amount: number;
  txn_type: "credit" | "debit" | null;
  channel: string | null;
  utr_ref: string | null;
  narration: string;
  payer_hint: string | null;
  balance: number | null;
  raw: Record<string, unknown>;
}

const HEADER_ALIASES: Record<string, string[]> = {
  txn_date: ["txn date", "transaction date", "date", "tran date", "posting date", "post date"],
  value_date: ["value date", "val date"],
  amount: ["amount", "credit", "credit amount", "cr amount", "deposit", "deposit amt"],
  debit: ["debit", "debit amount", "dr amount", "withdrawal", "withdrawal amt"],
  narration: ["narration", "description", "particulars", "remarks", "details", "transaction details"],
  ref: ["ref no", "reference", "ref no./cheque no.", "cheque no", "chq no", "ref/cheque no"],
  balance: ["balance", "closing balance", "running balance"],
};

function normalizeHeader(h: string): string {
  return String(h ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

function findKey(row: Record<string, unknown>, aliases: string[]): string | undefined {
  const lowered = Object.keys(row).map((k) => [k, normalizeHeader(k)] as const);
  for (const alias of aliases) {
    const hit = lowered.find(([, n]) => n === alias);
    if (hit) return hit[0];
  }
  for (const alias of aliases) {
    const hit = lowered.find(([, n]) => n.includes(alias));
    if (hit) return hit[0];
  }
  return undefined;
}

function toNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[,₹\s]/g, "").replace(/cr$/i, "").replace(/dr$/i, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) {
      const yyyy = d.y.toString().padStart(4, "0");
      const mm = String(d.m).padStart(2, "0");
      const dd = String(d.d).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }
  const s = String(v).trim();
  // Try DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD-MMM-YY
  const m1 = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m1) {
    const [, d, mo, y] = m1;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return s.slice(0, 10);
  const m3 = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})$/);
  if (m3) {
    const [, d, mon, y] = m3;
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const moIdx = months.indexOf(mon.toLowerCase());
    if (moIdx >= 0) {
      const year = y.length === 2 ? 2000 + Number(y) : Number(y);
      return `${year}-${String(moIdx + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

const UTR_PATTERNS: Array<{ re: RegExp; channel: string }> = [
  { re: /\bUTR[:\s/-]*([A-Z0-9]{10,22})/i, channel: "NEFT" },
  { re: /\bNEFT[/\s-]+([A-Z0-9]{10,22})/i, channel: "NEFT" },
  { re: /\bRTGS[/\s-]+([A-Z0-9]{10,22})/i, channel: "RTGS" },
  { re: /\bIMPS[/\s-]+([A-Z0-9]{10,22})/i, channel: "IMPS" },
  { re: /\bUPI[/\s-]+([A-Z0-9]{8,22})/i, channel: "UPI" },
  { re: /\b([A-Z]{4}[A-Z0-9]{6,18})\b/, channel: "NEFT" }, // bank ref like HDFCN52...
];

export function extractUtr(narration: string): { utr: string | null; channel: string | null; payer: string | null } {
  const text = String(narration ?? "");
  for (const { re, channel } of UTR_PATTERNS) {
    const m = text.match(re);
    if (m) {
      // payer hint = remaining text after the ref
      const after = text.slice((m.index ?? 0) + m[0].length);
      const payer = after.split(/[/\-|]/).map((s) => s.trim()).filter(Boolean)[0] ?? null;
      return { utr: m[1].toUpperCase(), channel, payer };
    }
  }
  // Fallback: just guess channel
  if (/UPI/i.test(text)) return { utr: null, channel: "UPI", payer: null };
  if (/NEFT/i.test(text)) return { utr: null, channel: "NEFT", payer: null };
  if (/RTGS/i.test(text)) return { utr: null, channel: "RTGS", payer: null };
  return { utr: null, channel: null, payer: null };
}

export interface ColumnMapping {
  /** 1-based row that contains headers (1 = first row). */
  header_row?: number;
  txn_date?: string;
  value_date?: string;
  credit?: string;
  debit?: string;
  narration?: string;
  ref?: string;
  balance?: string;
}

/** Read the raw rows + detected headers from a bank statement file. */
export async function readBankStatementSheet(
  file: File,
  headerRow = 1,
): Promise<{ headers: string[]; rows: Record<string, unknown>[]; preview: Record<string, unknown>[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { headers: [], rows: [], preview: [] };
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", blankrows: false });
  const hIdx = Math.max(0, headerRow - 1);
  const headers = (aoa[hIdx] ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const dataRows = aoa.slice(hIdx + 1).map((arr) => {
    const o: Record<string, unknown> = {};
    headers.forEach((h, i) => { o[h] = arr[i] ?? ""; });
    return o;
  });
  return { headers, rows: dataRows, preview: dataRows.slice(0, 5) };
}

export async function parseBankStatement(file: File, mapping?: ColumnMapping): Promise<ParsedBankRow[]> {
  const { headers, rows } = await readBankStatementSheet(file, mapping?.header_row ?? 1);
  if (rows.length === 0) return [];

  const resolve = (mapped: string | undefined, aliases: string[]): string => {
    if (mapped && headers.includes(mapped)) return mapped;
    return findKey(rows[0], aliases) ?? "";
  };

  const dateK = resolve(mapping?.txn_date, HEADER_ALIASES.txn_date);
  const valDateK = resolve(mapping?.value_date, HEADER_ALIASES.value_date);
  const creditK = resolve(mapping?.credit, HEADER_ALIASES.amount);
  const debitK = resolve(mapping?.debit, HEADER_ALIASES.debit);
  const narrK = resolve(mapping?.narration, HEADER_ALIASES.narration);
  const refK = resolve(mapping?.ref, HEADER_ALIASES.ref);
  const balK = resolve(mapping?.balance, HEADER_ALIASES.balance);

  return rows.map((row): ParsedBankRow => {
    const credit = toNumber(row[creditK]);
    const debit = toNumber(row[debitK]);
    const amount = credit > 0 ? credit : debit;
    const txn_type: "credit" | "debit" | null = credit > 0 ? "credit" : debit > 0 ? "debit" : null;
    const narration = String(row[narrK] ?? "");
    const refCell = refK ? String(row[refK] ?? "").trim() : "";
    const { utr, channel, payer } = extractUtr(`${refCell} ${narration}`);
    return {
      txn_date: toDate(row[dateK]),
      value_date: toDate(row[valDateK]),
      amount,
      txn_type,
      channel,
      utr_ref: utr ?? (refCell && /^[A-Z0-9]{8,}$/i.test(refCell.replace(/\s+/g, "")) ? refCell.replace(/\s+/g, "").toUpperCase() : null),
      narration,
      payer_hint: payer,
      balance: balK ? toNumber(row[balK]) : null,
      raw: row,
    };
  });
}


// ---------- Matching ----------

export interface MatchableClaim {
  id: string;
  claim_number: string;
  patient_name: string;
  tpa_name: string | null;
  insurance_company_name: string | null;
  approved_amount: number | null;
  settled_amount: number | null;
  cheque_neft_utr_no: string | null;
  cheque_neft_utr_date: string | null;
  claim_status: string | null;
}

export interface MatchSuggestion {
  claim: MatchableClaim;
  confidence: number; // 0..100
  method: "auto_utr" | "auto_amount_date" | "fuzzy_payer";
  reasons: string[];
}

function stripUtr(s: string | null | undefined): string {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) return Infinity;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return Infinity;
  return Math.abs(da - db) / 86_400_000;
}

/** Normalize a payer / payee name: lowercase, strip punctuation and common suffixes. */
export function normalizePayer(s: string | null | undefined): string {
  if (!s) return "";
  const stop = /\b(pvt|private|ltd|limited|insurance|assurance|general|health|tpa|services|service|india|co|company|corp|corporation|the|of|and|&)\b/g;
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(stop, " ").replace(/\s+/g, " ").trim();
}

function tokenOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const at = new Set(a.split(" ").filter((t) => t.length >= 3));
  const bt = b.split(" ").filter((t) => t.length >= 3);
  if (at.size === 0 || bt.length === 0) return 0;
  let hit = 0;
  for (const t of bt) if (at.has(t)) hit++;
  return hit / Math.max(at.size, bt.length);
}

export interface ScoreOptions {
  /** Second pass uses looser tolerances. */
  secondPass?: boolean;
}

export function scoreMatches(entry: ParsedBankRow, claims: MatchableClaim[], opts: ScoreOptions = {}): MatchSuggestion[] {
  const out: MatchSuggestion[] = [];
  const entryUtr = stripUtr(entry.utr_ref);
  const payerNorm = normalizePayer(entry.payer_hint ?? entry.narration);
  const looseAmtPct = opts.secondPass ? 2 : 1;
  const looseDays = opts.secondPass ? 45 : 30;

  for (const c of claims) {
    const reasons: string[] = [];
    let score = 0;
    let method: MatchSuggestion["method"] = "fuzzy_payer";

    // UTR exact / substring
    const claimUtr = stripUtr(c.cheque_neft_utr_no);
    if (entryUtr && claimUtr) {
      if (entryUtr === claimUtr) {
        score = 100; method = "auto_utr"; reasons.push("UTR matches exactly");
      } else if (entryUtr.includes(claimUtr) || claimUtr.includes(entryUtr)) {
        score = Math.max(score, 90); method = "auto_utr"; reasons.push("UTR contains match");
      }
    }

    // Amount + date proximity (against approved/settled)
    const targetAmount = Number(c.settled_amount || c.approved_amount || 0);
    if (targetAmount > 0 && entry.amount > 0) {
      const diff = Math.abs(targetAmount - entry.amount);
      const pctDiff = (diff / targetAmount) * 100;
      const dDays = daysBetween(entry.txn_date, c.cheque_neft_utr_date);
      if (diff < 1 && dDays <= 7) {
        score = Math.max(score, 85);
        if (method === "fuzzy_payer") method = "auto_amount_date";
        reasons.push(`Exact amount ₹${entry.amount} within ${Math.round(dDays)}d`);
      } else if (pctDiff < 1 && dDays <= 14) {
        score = Math.max(score, 70);
        if (method === "fuzzy_payer") method = "auto_amount_date";
        reasons.push(`Amount ~${pctDiff.toFixed(1)}% diff within ${Math.round(dDays)}d`);
      } else if (pctDiff < looseAmtPct && dDays <= looseDays) {
        score = Math.max(score, opts.secondPass ? 60 : 50);
        reasons.push(`Amount ~${pctDiff.toFixed(1)}% diff within ${Math.round(dDays)}d`);
      }
    }

    // Payer hint vs TPA / insurer — normalized + token overlap
    const tpaNorm = normalizePayer(c.tpa_name);
    const insNorm = normalizePayer(c.insurance_company_name);
    if (payerNorm.length >= 3) {
      const ov = Math.max(tokenOverlap(tpaNorm, payerNorm), tokenOverlap(insNorm, payerNorm));
      if (ov >= 0.5) {
        score = Math.min(100, score + 15);
        reasons.push(`Payer matches TPA/insurer (${Math.round(ov * 100)}%)`);
      } else if (ov > 0) {
        score = Math.min(100, score + 8);
        reasons.push(`Payer partial match (${Math.round(ov * 100)}%)`);
      } else if ((tpaNorm && payerNorm.includes(tpaNorm)) || (insNorm && payerNorm.includes(insNorm))) {
        score = Math.min(100, score + 10);
        reasons.push("Payer name contains TPA/insurer");
      }
    }

    const floor = opts.secondPass ? 45 : 50;
    if (score >= floor) {
      out.push({ claim: c, confidence: score, method, reasons });
    }
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 5);
}

