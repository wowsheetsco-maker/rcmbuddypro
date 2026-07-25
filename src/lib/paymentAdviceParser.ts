/**
 * Payment Advice PDF parser.
 *
 * TPA / insurer remittance advices bundle many claims under a single UTR.
 * This parser extracts text from a PDF using pdfjs-dist, then applies
 * heuristics to pull out:
 *   - the top-level UTR / payment reference and payment date
 *   - claim-wise line items: claim number, patient name, billed / approved,
 *     TDS, disallowance, net paid
 *
 * The output feeds a UTR → many-claims matcher so a single bank credit can
 * be reconciled against every claim it settled.
 */
import * as pdfjsLib from "pdfjs-dist";
// Vite-friendly worker URL
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

(pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = PdfWorker;

export interface PaymentAdviceLine {
  claim_number: string | null;
  patient_name: string | null;
  billed_amount: number | null;
  approved_amount: number | null;
  disallowance: number | null;
  tds: number | null;
  net_paid: number;
  raw_line: string;
}

export interface ParsedPaymentAdvice {
  utr: string | null;
  payment_date: string | null;
  payer_name: string | null;
  total_amount: number;
  lines: PaymentAdviceLine[];
  raw_text: string;
}

/** Load a PDF file and return concatenated text, keeping line breaks. */
export async function extractPdfText(file: File | ArrayBuffer): Promise<string> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Reconstruct lines by y-coordinate
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str: item.str });
    }
    const ys = Array.from(rows.keys()).sort((a, b) => b - a);
    for (const y of ys) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x).map((p) => p.str);
      pages.push(parts.join(" "));
    }
    pages.push(""); // page break
  }
  return pages.join("\n");
}

const UTR_LABEL_RE = /\b(?:UTR|Payment\s*Ref(?:erence)?|NEFT\s*Ref|RTGS\s*Ref|Transaction\s*(?:Ref|ID)|Cheque\s*(?:No|Number))\s*[:\-#]?\s*([A-Z0-9]{8,25})/i;
const UTR_STANDALONE_RE = /\b([A-Z]{2,6}[A-Z0-9]{8,20})\b/;

const DATE_LABEL_RE = /\b(?:Payment\s*Date|Paid\s*On|Date\s*of\s*Payment|Value\s*Date|UTR\s*Date)\s*[:\-]?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\s*[A-Za-z]{3,9}\s*[0-9]{2,4})/i;

const TOTAL_LABEL_RE = /\b(?:Total\s*(?:Net\s*)?(?:Payable|Paid|Amount|Payment)|Grand\s*Total|Net\s*Amount)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]+)?)/i;

const PAYER_LABEL_RE = /\b(?:Payer|From|Insurer|TPA|Company\s*Name|Paid\s*By)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 .,&()\-]{4,60})/i;

const NUMBER_RE = /-?[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|-?[0-9]+(?:\.[0-9]{1,2})?/g;

function parseNumber(s: string): number {
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseDateLoose(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^([0-9]{1,2})[-/]([0-9]{1,2})[-/]([0-9]{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = t.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if (m) return t;
  m = t.match(/^([0-9]{1,2})\s*([A-Za-z]{3,9})\s*([0-9]{2,4})$/);
  if (m) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const idx = months.indexOf(m[2].slice(0, 3).toLowerCase());
    if (idx >= 0) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return `${y}-${String(idx + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  return null;
}

/** Looks like a claim number: alphanumeric, 6-20 chars, contains at least 4 digits. */
function looksLikeClaimNo(tok: string): boolean {
  if (tok.length < 6 || tok.length > 22) return false;
  if (!/^[A-Z0-9/-]+$/i.test(tok)) return false;
  const digits = tok.replace(/[^0-9]/g, "").length;
  return digits >= 5;
}

function extractPatientName(tokens: string[], claimIdx: number): string | null {
  // Patient name usually appears right after claim number, before numeric columns
  const nameToks: string[] = [];
  for (let i = claimIdx + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^-?[0-9,.]+$/.test(t)) break;
    if (/^(Rs\.?|INR|₹)$/i.test(t)) break;
    if (t.length > 40) break;
    nameToks.push(t);
    if (nameToks.length >= 6) break;
  }
  const name = nameToks.join(" ").replace(/[^A-Za-z .]/g, "").trim();
  return name.length >= 3 ? name : null;
}

export function parsePaymentAdviceText(text: string): ParsedPaymentAdvice {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  // Header extraction — scan first 40 lines
  const head = lines.slice(0, 40).join(" \n ");
  const utrLabel = head.match(UTR_LABEL_RE);
  const utr = utrLabel?.[1] ?? head.match(UTR_STANDALONE_RE)?.[1] ?? null;
  const payment_date = parseDateLoose((head.match(DATE_LABEL_RE)?.[1] ?? "").trim()) || null;
  const totalRaw = head.match(TOTAL_LABEL_RE)?.[1];
  const totalFromHeader = totalRaw ? parseNumber(totalRaw) : 0;
  const payer_name = head.match(PAYER_LABEL_RE)?.[1]?.trim() ?? null;

  const outLines: PaymentAdviceLine[] = [];
  for (const raw of lines) {
    const tokens = raw.split(/\s+/);
    // Find a claim-like token
    const claimIdx = tokens.findIndex(looksLikeClaimNo);
    if (claimIdx < 0) continue;
    const nums = raw.match(NUMBER_RE) ?? [];
    // Require at least 1 monetary value on the row
    const monetary = nums.map(parseNumber).filter((n) => Math.abs(n) >= 1);
    if (monetary.length < 1) continue;
    // Skip rows that look like totals
    if (/\btotal\b/i.test(raw) && !tokens[claimIdx].match(/[0-9]{5,}/)) continue;

    const patient = extractPatientName(tokens, claimIdx);
    // Heuristic: last number = net paid, prior numbers may be billed/approved/disallow/tds
    const net = monetary[monetary.length - 1];
    let billed: number | null = null;
    let approved: number | null = null;
    let disallow: number | null = null;
    let tds: number | null = null;
    if (monetary.length >= 4) {
      billed = monetary[0];
      approved = monetary[1];
      // pick a small (~10%) value as TDS if present
      const rest = monetary.slice(2, -1);
      const tdsIdx = rest.findIndex((v) => v > 0 && approved && v <= approved * 0.15);
      if (tdsIdx >= 0) tds = rest[tdsIdx];
      const others = rest.filter((_, i) => i !== tdsIdx);
      if (others.length) disallow = others[0];
    } else if (monetary.length === 3) {
      billed = monetary[0];
      approved = monetary[1];
    } else if (monetary.length === 2) {
      approved = monetary[0];
    }

    outLines.push({
      claim_number: tokens[claimIdx],
      patient_name: patient,
      billed_amount: billed,
      approved_amount: approved,
      disallowance: disallow,
      tds,
      net_paid: net,
      raw_line: raw,
    });
  }

  const total_amount = totalFromHeader > 0
    ? totalFromHeader
    : outLines.reduce((s, l) => s + (l.net_paid || 0), 0);

  return { utr, payment_date, payer_name, total_amount, lines: outLines, raw_text: text };
}

export async function parsePaymentAdvicePdf(file: File): Promise<ParsedPaymentAdvice> {
  const text = await extractPdfText(file);
  return parsePaymentAdviceText(text);
}

// -------------------- UTR → many-claims matcher --------------------

export interface AdviceMatchClaim {
  id: string;
  claim_number: string;
  patient_name: string;
  approved_amount: number | null;
  settled_amount: number | null;
  tpa_name: string | null;
  insurance_company_name: string | null;
}

export interface AdviceLineMatch {
  line: PaymentAdviceLine;
  claim: AdviceMatchClaim | null;
  confidence: number; // 0..100
  method: "claim_number" | "initial_claim_number" | "patient+amount" | "amount_only" | "none";
  reasons: string[];
}

function stripKey(s: string | null | undefined): string {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function nameSimilarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter((t) => t.length >= 3));
  const tb = b.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  if (!ta.size || !tb.length) return 0;
  let hit = 0;
  for (const t of tb) if (ta.has(t)) hit++;
  return hit / Math.max(ta.size, tb.length);
}

export interface MatchAdviceOptions {
  amountTolerancePct?: number; // default 2
  amountToleranceAbs?: number; // default 5
}

/**
 * Match every line of a payment advice against candidate claims.
 * Prioritizes exact claim-number match, then patient + amount, then amount.
 * Returns per-line match plus a reconciliation summary (matched vs total).
 */
export function matchAdviceLines(
  advice: ParsedPaymentAdvice,
  claims: AdviceMatchClaim[],
  opts: MatchAdviceOptions = {},
): { matches: AdviceLineMatch[]; summary: { totalLines: number; matchedLines: number; totalAmount: number; matchedAmount: number; unmatchedAmount: number } } {
  const pct = opts.amountTolerancePct ?? 2;
  const abs = opts.amountToleranceAbs ?? 5;
  const byClaimNo = new Map<string, AdviceMatchClaim>();
  for (const c of claims) {
    const k = stripKey(c.claim_number);
    if (k) byClaimNo.set(k, c);
  }

  const used = new Set<string>();
  const matches: AdviceLineMatch[] = advice.lines.map((line) => {
    const reasons: string[] = [];
    const lineKey = stripKey(line.claim_number);
    // 1. Exact claim-number match
    if (lineKey && byClaimNo.has(lineKey) && !used.has(byClaimNo.get(lineKey)!.id)) {
      const c = byClaimNo.get(lineKey)!;
      used.add(c.id);
      reasons.push("Claim number matches exactly");
      // Bonus: amount agrees
      let conf = 92;
      if (line.net_paid > 0 && c.approved_amount) {
        const target = Number(c.approved_amount);
        const diff = Math.abs(target - line.net_paid);
        const pctDiff = target > 0 ? (diff / target) * 100 : 100;
        if (pctDiff <= pct || diff <= abs) { conf = 100; reasons.push("Net paid aligns with approved"); }
      }
      return { line, claim: c, confidence: conf, method: "claim_number" as const, reasons };
    }
    // 2. Substring / partial claim-number
    if (lineKey) {
      for (const c of claims) {
        if (used.has(c.id)) continue;
        const ck = stripKey(c.claim_number);
        if (ck && (ck.includes(lineKey) || lineKey.includes(ck)) && Math.min(ck.length, lineKey.length) >= 6) {
          used.add(c.id);
          reasons.push("Claim number contains match");
          return { line, claim: c, confidence: 80, method: "initial_claim_number" as const, reasons };
        }
      }
    }
    // 3. Patient name + amount
    if (line.patient_name) {
      let best: { c: AdviceMatchClaim; score: number } | null = null;
      for (const c of claims) {
        if (used.has(c.id)) continue;
        const nameScore = nameSimilarity(c.patient_name || "", line.patient_name);
        if (nameScore < 0.5) continue;
        const target = Number(c.approved_amount || 0);
        if (target <= 0 || line.net_paid <= 0) continue;
        const diff = Math.abs(target - line.net_paid);
        const pctDiff = (diff / target) * 100;
        if (pctDiff <= pct || diff <= abs) {
          const s = nameScore * 60 + (100 - pctDiff) * 0.3;
          if (!best || s > best.score) best = { c, score: s };
        }
      }
      if (best) {
        used.add(best.c.id);
        reasons.push("Patient name + approved amount match");
        return { line, claim: best.c, confidence: 78, method: "patient+amount" as const, reasons };
      }
    }
    // 4. Amount only (last resort — low confidence)
    if (line.net_paid > 0) {
      for (const c of claims) {
        if (used.has(c.id)) continue;
        const target = Number(c.approved_amount || 0);
        if (target <= 0) continue;
        const diff = Math.abs(target - line.net_paid);
        const pctDiff = (diff / target) * 100;
        if (diff <= abs || pctDiff <= 0.5) {
          used.add(c.id);
          reasons.push("Approved amount matches (unique)");
          return { line, claim: c, confidence: 55, method: "amount_only" as const, reasons };
        }
      }
    }
    return { line, claim: null, confidence: 0, method: "none" as const, reasons: ["No candidate claim matched"] };
  });

  const totalAmount = advice.lines.reduce((s, l) => s + (l.net_paid || 0), 0);
  const matchedAmount = matches.filter((m) => m.claim).reduce((s, m) => s + (m.line.net_paid || 0), 0);
  return {
    matches,
    summary: {
      totalLines: matches.length,
      matchedLines: matches.filter((m) => m.claim).length,
      totalAmount,
      matchedAmount,
      unmatchedAmount: totalAmount - matchedAmount,
    },
  };
}
