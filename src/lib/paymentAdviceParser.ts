/**
 * Payment Advice PDF parser.
 *
 * TPA / insurer remittance advices bundle many claims under a single UTR.
 * This parser extracts text from a PDF using pdfjs-dist, then applies
 * heuristics to pull out:
 *   - the top-level UTR / payment reference and payment date
 *   - claim-wise line items across common bank / TPA layouts
 *
 * If the PDF has no selectable text (scanned image), we fall back to
 * client-side OCR via tesseract.js (lazy-loaded).
 */
// pdfjs-dist references DOMMatrix at module load, which does not exist in the
// SSR runtime. Load it lazily and only in the browser.
type PdfjsModule = typeof import("pdfjs-dist");
let _pdfjsPromise: Promise<PdfjsModule> | undefined;
async function getPdfjs(): Promise<PdfjsModule> {
  if (typeof window === "undefined") {
    throw new Error("PDF parsing is only available in the browser");
  }
  if (!_pdfjsPromise) {
    _pdfjsPromise = (async () => {
      const mod = await import("pdfjs-dist");
      // @ts-expect-error - vite ?url import, resolved at build time
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      (mod as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = workerUrl;
      return mod;
    })();
  }
  return _pdfjsPromise;
}

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

export type AdviceLayout =
  | "star_health"
  | "care_health"
  | "hdfc_ergo"
  | "icici_lombard"
  | "bajaj_allianz"
  | "medi_assist"
  | "paramount"
  | "vidal"
  | "generic_table"
  | "generic_text";

export interface ParsedPaymentAdvice {
  utr: string | null;
  payment_date: string | null;
  payer_name: string | null;
  total_amount: number;
  lines: PaymentAdviceLine[];
  raw_text: string;
  layout: AdviceLayout;
  used_ocr: boolean;
}

export interface OcrSettings {
  /** Tesseract language(s), e.g. "eng", "eng+hin" */
  language?: string;
  /** Render scale for pdf.js canvas — higher = better OCR, slower. Effective DPI ≈ 72 × scale */
  scale?: number;
  /** Rotate rendered page before OCR: 0 | 90 | 180 | 270 */
  rotate?: 0 | 90 | 180 | 270;
  /** Preserve interword spacing / column layout — helps table extraction */
  tableMode?: boolean;
}

export interface ExtractOptions {
  /** allow OCR fallback when the PDF has little/no embedded text */
  enableOcr?: boolean;
  /** force OCR even when text is available */
  forceOcr?: boolean;
  /** OCR tuning knobs */
  ocr?: OcrSettings;
  onProgress?: (msg: string, pct: number) => void;
}

/** Extract text from a PDF, preserving line breaks by y-coordinate.
 *  Falls back to OCR when embedded text is insufficient.
 */
export async function extractPdfText(
  file: File | ArrayBuffer,
  opts: ExtractOptions = {},
): Promise<{ text: string; used_ocr: boolean }> {
  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts: string[] = [];
  let totalChars = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    opts.onProgress?.(`Reading page ${p} of ${doc.numPages}…`, (p / doc.numPages) * 40);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str: item.str });
    }
    const ys = Array.from(rows.keys()).sort((a, b) => b - a);
    const pageLines: string[] = [];
    for (const y of ys) {
      const parts = rows.get(y)!.sort((a, b) => a.x - b.x).map((p) => p.str);
      pageLines.push(parts.join(" "));
    }
    const joined = pageLines.join("\n");
    totalChars += joined.replace(/\s/g, "").length;
    pageTexts.push(joined);
  }

  const looksScanned = totalChars < Math.max(60, doc.numPages * 40);
  if (!opts.forceOcr && (!looksScanned || !opts.enableOcr)) {
    return { text: pageTexts.join("\n\n"), used_ocr: false };
  }
  if (!opts.enableOcr && !opts.forceOcr) {
    return { text: pageTexts.join("\n\n"), used_ocr: false };
  }

  // ---- OCR fallback ----
  const lang = opts.ocr?.language || "eng";
  const scale = Math.max(1, Math.min(4, opts.ocr?.scale ?? 2));
  const rotate = opts.ocr?.rotate ?? 0;
  const tableMode = opts.ocr?.tableMode ?? true;
  opts.onProgress?.(`Scanned PDF detected — starting OCR (${lang} @ ${Math.round(72 * scale)} DPI)…`, 45);
  const { default: Tesseract } = await import("tesseract.js");
  const ocrPages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale, rotation: rotate });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas } as unknown as Parameters<typeof page.render>[0]).promise;
    opts.onProgress?.(`OCR page ${p} of ${doc.numPages}…`, 45 + (p / doc.numPages) * 50);
    const tessOptions: Record<string, unknown> = {
      logger: (m: { status?: string; progress?: number }) => {
        if (m.status === "recognizing text" && typeof m.progress === "number") {
          const base = 45 + ((p - 1) / doc.numPages) * 50;
          opts.onProgress?.(`OCR page ${p} (${Math.round(m.progress * 100)}%)…`, base + (m.progress * 50) / doc.numPages);
        }
      },
    };
    if (tableMode) {
      tessOptions.preserve_interword_spaces = "1";
      // PSM 6 = Assume a single uniform block of text — best for tabular remittance advices
      tessOptions.tessedit_pageseg_mode = "6";
    }
    const result = await Tesseract.recognize(canvas, lang, tessOptions);
    ocrPages.push(result.data.text || "");
  }
  return { text: ocrPages.join("\n\n"), used_ocr: true };
}

// -------------------- Header extraction --------------------

const UTR_LABEL_RE = /\b(?:UTR(?:\s*No\.?)?|Payment\s*Ref(?:erence)?|NEFT\s*(?:Ref|No)?|RTGS\s*(?:Ref|No)?|Transaction\s*(?:Ref|ID|No)|Cheque\s*(?:No|Number))\s*[:\-#]?\s*([A-Z0-9]{8,25})/i;
const UTR_STANDALONE_RE = /\b([A-Z]{2,6}[A-Z0-9]{8,20})\b/;
const DATE_LABEL_RE = /\b(?:Payment\s*Date|Paid\s*On|Date\s*of\s*Payment|Value\s*Date|UTR\s*Date|Cheque\s*Date|Settlement\s*Date)\s*[:\-]?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\s*[A-Za-z]{3,9}\s*[0-9]{2,4})/i;
const TOTAL_LABEL_RE = /\b(?:Total\s*(?:Net\s*)?(?:Payable|Paid|Amount|Payment|Settlement)|Grand\s*Total|Net\s*(?:Payable|Amount))\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]+)?)/i;
const PAYER_LABEL_RE = /\b(?:Payer|From|Insurer|TPA|Company\s*Name|Paid\s*By|Insurance\s*Company)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9 .,&()\-]{4,60})/i;

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

function looksLikeClaimNo(tok: string): boolean {
  if (tok.length < 6 || tok.length > 24) return false;
  if (!/^[A-Z0-9/-]+$/i.test(tok)) return false;
  const digits = tok.replace(/[^0-9]/g, "").length;
  return digits >= 5;
}

// -------------------- Layout detection --------------------

const LAYOUT_SIGNATURES: Array<{ layout: AdviceLayout; payer: string; patterns: RegExp[] }> = [
  { layout: "star_health",   payer: "Star Health",         patterns: [/star\s*health/i, /star\s*allied/i] },
  { layout: "care_health",   payer: "Care Health",         patterns: [/\bcare\s*health\b/i, /\breligare\s*health\b/i] },
  { layout: "hdfc_ergo",     payer: "HDFC ERGO",           patterns: [/hdfc\s*ergo/i] },
  { layout: "icici_lombard", payer: "ICICI Lombard",       patterns: [/icici\s*lombard/i] },
  { layout: "bajaj_allianz", payer: "Bajaj Allianz",       patterns: [/bajaj\s*allianz/i] },
  { layout: "medi_assist",   payer: "Medi Assist",         patterns: [/medi\s*assist/i, /mahyco/i] },
  { layout: "paramount",     payer: "Paramount Health",    patterns: [/paramount\s*health/i, /\bphs\b/i] },
  { layout: "vidal",         payer: "Vidal Health",        patterns: [/vidal\s*health/i, /vidalhealth/i] },
];

function detectLayout(headerText: string, allText: string): { layout: AdviceLayout; payer_hint: string | null } {
  for (const sig of LAYOUT_SIGNATURES) {
    if (sig.patterns.some((p) => p.test(headerText) || p.test(allText))) {
      return { layout: sig.layout, payer_hint: sig.payer };
    }
  }
  // Look for a table header row containing typical column names
  if (/claim\s*(no|number|id).*(patient|insured).*(bill|approved|paid|net)/i.test(allText)) {
    return { layout: "generic_table", payer_hint: null };
  }
  return { layout: "generic_text", payer_hint: null };
}

// -------------------- Column-header aware extraction --------------------

interface ColumnMap {
  claim?: number;
  patient?: number;
  billed?: number;
  approved?: number;
  disallowance?: number;
  tds?: number;
  net?: number;
}

const HEADER_ALIASES: Array<[keyof ColumnMap, RegExp]> = [
  ["claim",        /\b(claim\s*(?:no|number|id|ref)|cl\.\s*no|bill\s*no)\b/i],
  ["patient",      /\b(patient(?:\s*name)?|insured(?:\s*name)?|member(?:\s*name)?|beneficiary)\b/i],
  ["billed",       /\b(bill(?:ed)?\s*(?:amount|amt)?|claimed\s*(?:amount|amt)|gross|invoice)\b/i],
  ["approved",     /\b(approv(?:ed)?\s*(?:amount|amt)?|sanction(?:ed)?|payable|passed)\b/i],
  ["disallowance", /\b(disallow(?:ed|ance)?|deduct(?:ion|ed)?|non[- ]?payable|less)\b/i],
  ["tds",          /\b(tds|tax\s*deduc)\b/i],
  ["net",          /\b(net\s*(?:paid|payable|amount|amt)|paid\s*amount|settlement\s*amount|final)\b/i],
];

function findHeaderRow(lines: string[]): { idx: number; map: ColumnMap } | null {
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    const l = lines[i];
    if (!/claim/i.test(l)) continue;
    const map: ColumnMap = {};
    for (const [key, re] of HEADER_ALIASES) {
      const m = l.match(re);
      if (m && m.index !== undefined) map[key] = m.index;
    }
    // Require at least claim + one amount column
    const amountCols = ["billed", "approved", "net"].filter((k) => (map as Record<string, number | undefined>)[k] !== undefined).length;
    if (map.claim !== undefined && amountCols >= 1) return { idx: i, map };
  }
  return null;
}

function tokenizeWithPositions(line: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push({ text: m[0], start: m.index });
  return out;
}

function pickByColumn(tokens: Array<{ text: string; start: number }>, col: number | undefined, isNumeric: boolean): string | null {
  if (col === undefined) return null;
  let best: { tok: { text: string; start: number }; dist: number } | null = null;
  for (const tok of tokens) {
    if (isNumeric && !/^-?[0-9,.]+$/.test(tok.text)) continue;
    const mid = tok.start + tok.text.length / 2;
    const dist = Math.abs(mid - col);
    if (!best || dist < best.dist) best = { tok, dist };
  }
  return best ? best.tok.text : null;
}

function parseRowByColumns(line: string, map: ColumnMap): PaymentAdviceLine | null {
  const tokens = tokenizeWithPositions(line);
  const claimTok = pickByColumn(tokens, map.claim, false);
  if (!claimTok || !looksLikeClaimNo(claimTok)) return null;

  // Patient name spans between claim col and first numeric col
  const firstNumCol = Math.min(
    ...(["billed", "approved", "disallowance", "tds", "net"] as const)
      .map((k) => map[k])
      .filter((v): v is number => v !== undefined),
  );
  const patientStart = (map.patient ?? map.claim! + claimTok.length + 1);
  let patientName: string | null = null;
  if (map.patient !== undefined) {
    const parts = tokens
      .filter((t) => t.start >= patientStart - 2 && t.start < firstNumCol - 2 && !/^-?[0-9,.]+$/.test(t.text))
      .map((t) => t.text);
    const n = parts.join(" ").replace(/[^A-Za-z .]/g, "").trim();
    if (n.length >= 3) patientName = n;
  }

  const num = (v: string | null): number | null => (v ? parseNumber(v) : null);
  const billed   = num(pickByColumn(tokens, map.billed, true));
  const approved = num(pickByColumn(tokens, map.approved, true));
  const disallow = num(pickByColumn(tokens, map.disallowance, true));
  const tds      = num(pickByColumn(tokens, map.tds, true));
  const netStr   = pickByColumn(tokens, map.net, true);
  const net      = netStr ? parseNumber(netStr) : (approved ?? 0);
  if (!net || net <= 0) return null;

  return {
    claim_number: claimTok,
    patient_name: patientName,
    billed_amount: billed,
    approved_amount: approved,
    disallowance: disallow,
    tds,
    net_paid: net,
    raw_line: line,
  };
}

// -------------------- Fallback heuristic row parser --------------------

function extractPatientNameFallback(tokens: string[], claimIdx: number): string | null {
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

function parseRowHeuristic(raw: string): PaymentAdviceLine | null {
  const tokens = raw.split(/\s+/);
  const claimIdx = tokens.findIndex(looksLikeClaimNo);
  if (claimIdx < 0) return null;
  const nums = raw.match(NUMBER_RE) ?? [];
  const monetary = nums.map(parseNumber).filter((n) => Math.abs(n) >= 1);
  if (monetary.length < 1) return null;
  if (/\btotal\b/i.test(raw) && !tokens[claimIdx].match(/[0-9]{5,}/)) return null;

  const patient = extractPatientNameFallback(tokens, claimIdx);
  const net = monetary[monetary.length - 1];
  let billed: number | null = null, approved: number | null = null, disallow: number | null = null, tds: number | null = null;
  if (monetary.length >= 4) {
    billed = monetary[0]; approved = monetary[1];
    const rest = monetary.slice(2, -1);
    const tdsIdx = rest.findIndex((v) => v > 0 && approved && v <= approved * 0.15);
    if (tdsIdx >= 0) tds = rest[tdsIdx];
    const others = rest.filter((_, i) => i !== tdsIdx);
    if (others.length) disallow = others[0];
  } else if (monetary.length === 3) { billed = monetary[0]; approved = monetary[1]; }
  else if (monetary.length === 2) { approved = monetary[0]; }

  return {
    claim_number: tokens[claimIdx],
    patient_name: patient,
    billed_amount: billed,
    approved_amount: approved,
    disallowance: disallow,
    tds,
    net_paid: net,
    raw_line: raw,
  };
}

// -------------------- Top-level parse --------------------

export function parsePaymentAdviceText(text: string, used_ocr = false): ParsedPaymentAdvice {
  const rawLines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const head = rawLines.slice(0, 40).join(" \n ");

  const utrLabel = head.match(UTR_LABEL_RE);
  const utr = utrLabel?.[1] ?? head.match(UTR_STANDALONE_RE)?.[1] ?? null;
  const payment_date = parseDateLoose((head.match(DATE_LABEL_RE)?.[1] ?? "").trim()) || null;
  const totalRaw = head.match(TOTAL_LABEL_RE)?.[1];
  const totalFromHeader = totalRaw ? parseNumber(totalRaw) : 0;

  const detected = detectLayout(head, text);
  const explicitPayer = head.match(PAYER_LABEL_RE)?.[1]?.trim() ?? null;
  const payer_name = explicitPayer ?? detected.payer_hint;

  // Retain original raw lines (with positions) for column-aware parsing
  const posLines = text.split(/\r?\n/);
  const header = findHeaderRow(posLines);

  const outLines: PaymentAdviceLine[] = [];
  const seen = new Set<number>();

  if (header) {
    for (let i = header.idx + 1; i < posLines.length; i++) {
      const l = posLines[i];
      if (!l || !l.trim()) continue;
      if (/^\s*(total|grand\s*total|net\s*total|sub\s*total)\b/i.test(l)) continue;
      const row = parseRowByColumns(l, header.map);
      if (row) { outLines.push(row); seen.add(i); }
    }
  }

  // Fallback heuristic for lines the column parser missed (or when no header)
  for (let i = 0; i < posLines.length; i++) {
    if (seen.has(i)) continue;
    const l = posLines[i].replace(/\s+/g, " ").trim();
    if (!l) continue;
    if (/^\s*(total|grand\s*total|net\s*total|sub\s*total)\b/i.test(l)) continue;
    const row = parseRowHeuristic(l);
    if (row) {
      // avoid duplicates by (claim_number + net)
      const key = `${row.claim_number}|${row.net_paid}`;
      if (!outLines.some((x) => `${x.claim_number}|${x.net_paid}` === key)) {
        outLines.push(row);
      }
    }
  }

  const total_amount = totalFromHeader > 0
    ? totalFromHeader
    : outLines.reduce((s, l) => s + (l.net_paid || 0), 0);

  const layout: AdviceLayout = detected.layout === "generic_text" && header ? "generic_table" : detected.layout;

  return { utr, payment_date, payer_name, total_amount, lines: outLines, raw_text: text, layout, used_ocr };
}

export async function parsePaymentAdvicePdf(file: File, opts: ExtractOptions = {}): Promise<ParsedPaymentAdvice> {
  const { text, used_ocr } = await extractPdfText(file, opts);
  opts.onProgress?.("Parsing rows…", 96);
  const res = parsePaymentAdviceText(text, used_ocr);
  opts.onProgress?.("Done", 100);
  return res;
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
  confidence: number;
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
  amountTolerancePct?: number;
  amountToleranceAbs?: number;
}

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
    if (lineKey && byClaimNo.has(lineKey) && !used.has(byClaimNo.get(lineKey)!.id)) {
      const c = byClaimNo.get(lineKey)!;
      used.add(c.id);
      reasons.push("Claim number matches exactly");
      let conf = 92;
      if (line.net_paid > 0 && c.approved_amount) {
        const target = Number(c.approved_amount);
        const diff = Math.abs(target - line.net_paid);
        const pctDiff = target > 0 ? (diff / target) * 100 : 100;
        if (pctDiff <= pct || diff <= abs) { conf = 100; reasons.push("Net paid aligns with approved"); }
      }
      return { line, claim: c, confidence: conf, method: "claim_number" as const, reasons };
    }
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

export const LAYOUT_LABELS: Record<AdviceLayout, string> = {
  star_health: "Star Health",
  care_health: "Care Health",
  hdfc_ergo: "HDFC ERGO",
  icici_lombard: "ICICI Lombard",
  bajaj_allianz: "Bajaj Allianz",
  medi_assist: "Medi Assist",
  paramount: "Paramount Health",
  vidal: "Vidal Health",
  generic_table: "Generic (table-based)",
  generic_text: "Generic (text-based)",
};
