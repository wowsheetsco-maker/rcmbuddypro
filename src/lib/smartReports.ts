import { formatInrShort, type Claim } from "@/data/mockClaims";

const SETTLED = new Set(["settled", "paid", "closed"]);
const DENIED = new Set([
  "pre auth denied", "claim denied", "discharge denied",
  "enhancement denied", "denied", "rejected",
]);
const SUBMITTED_NEGATIVE = new Set(["draft", "not submitted"]);

export type ReportKind = "ceo" | "ar" | "denial" | "corporate";

export interface ReportContext {
  claims: Claim[];
  hospitalName: string;
  /** Optional hospital logo URL. If absent, header shows initials from hospitalName. */
  hospitalLogoUrl?: string | null;
  periodLabel: string;
  fromDate: Date | null;
  toDate: Date | null;
  /** AR Aging Report: include the SLA 30-day breach list. Default: false. */
  includeIrdaiBreachList?: boolean;
}

/** Initials from hospital name — first letter of up to 2 words, uppercased. */
function hospitalInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "H";
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  return (a + b).toUpperCase() || "H";
}

/** Header brand block — uses uploaded logo if present, else initials fallback. */
function logoBlock(ctx: ReportContext): string {
  if (ctx.hospitalLogoUrl) {
    return `<div class="logo logo-img"><img src="${escape(ctx.hospitalLogoUrl)}" alt="${escape(ctx.hospitalName)}" /></div>`;
  }
  return `<div class="logo">${escape(hospitalInitials(ctx.hospitalName))}</div>`;
}

const fmt = formatInrShort;

function todayLong() {
  return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
}

function pageShell(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escape(title)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; font-size: 11px; line-height: 1.45; background: #fff; }
  .wrap { max-width: 800px; margin: 0 auto; padding: 18px 22px; }
  .header { display: flex; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 2px solid #111827; }
  .logo { width: 36px; height: 36px; border-radius: 6px; background: linear-gradient(135deg,#dc2626,#7c3aed); display:grid; place-items:center; color:#fff; font-weight:800; font-size:14px; letter-spacing: -.5px;}
  .h-title { font-size: 18px; font-weight: 800; letter-spacing: -.3px; }
  .h-sub { font-size: 10.5px; color: #6b7280; margin-top: 2px; }
  .section-title { font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #111827; margin: 18px 0 8px; padding-left: 8px; border-left: 3px solid #dc2626; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 11px; background: #fff; }
  .kpi .l { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #6b7280; text-transform: uppercase; }
  .kpi .v { font-size: 18px; font-weight: 800; margin-top: 4px; letter-spacing: -.4px; }
  .kpi .c { font-size: 9.5px; color: #6b7280; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10.5px; }
  th, td { text-align: left; padding: 7px 9px; border-bottom: 1px solid #e5e7eb; }
  th { font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #6b7280; background: #f9fafb; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .funnel { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .funnel .step { border-radius: 6px; padding: 12px 11px; color: #fff; }
  .funnel .step .l { font-size: 9px; font-weight: 700; letter-spacing: 1px; opacity: .9; }
  .funnel .step .v { font-size: 18px; font-weight: 800; margin-top: 6px; letter-spacing: -.4px; }
  .funnel .step .p { font-size: 11px; font-weight: 700; margin-top: 4px; }
  .funnel .step .c { font-size: 9.5px; opacity: .9; margin-top: 2px; }
  .insight { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; margin-top: 6px; }
  .insight h4 { margin: 0 0 4px; font-size: 11px; letter-spacing: .5px; color: #111827; }
  .insight p { margin: 0; color: #374151; }
  .action { border-left: 3px solid #dc2626; background: #fef2f2; border-radius: 0 6px 6px 0; padding: 10px 12px; margin-top: 6px; display: grid; grid-template-columns: 1fr auto; gap: 6px; }
  .action h4 { margin: 0; font-size: 11.5px; }
  .action .amt { font-size: 13px; font-weight: 800; color: #b91c1c; }
  .action p { margin: 4px 0 0; color: #4b5563; font-size: 10.5px; }
  .alert { border: 1px solid #fecaca; background: #fef2f2; border-radius: 6px; padding: 10px 12px; margin-top: 6px; }
  .alert h4 { margin: 0; font-size: 11.5px; color: #b91c1c; }
  .alert p { margin: 4px 0 0; color: #7f1d1d; font-size: 10.5px; }
  .footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 9.5px; color: #6b7280; text-align: center; }
  .total-row { background: #f9fafb; font-weight: 700; }
  .red { color: #dc2626; } .amber { color: #d97706; } .emerald { color: #059669; }
  .pill { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 9px; font-weight: 700; letter-spacing: .5px; }
  .pill-red { background: #fee2e2; color: #b91c1c; }
  .pill-amber { background: #fef3c7; color: #92400e; }
  .pill-emerald { background: #d1fae5; color: #065f46; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }

  /* Floating action bar */
  .action-bar {
    position: fixed; top: 12px; right: 12px; z-index: 9999;
    display: flex; align-items: center; gap: 8px;
    background: #111827; color: #fff;
    padding: 8px 10px; border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,.25);
    font-size: 12px;
  }
  .action-bar .status { display: flex; align-items: center; gap: 6px; padding: 0 6px; opacity: .85; }
  .action-bar .spinner {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,.3); border-top-color: #fff;
    animation: spin .8s linear infinite;
  }
  .action-bar .ready-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #10b981;
    box-shadow: 0 0 0 3px rgba(16,185,129,.25);
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .action-bar button {
    appearance: none; border: 0; cursor: pointer;
    font-size: 12px; font-weight: 700;
    padding: 7px 12px; border-radius: 6px;
    display: inline-flex; align-items: center; gap: 6px;
    transition: background .15s, opacity .15s;
  }
  .action-bar button[disabled] { opacity: .5; cursor: not-allowed; }
  .action-bar .btn-primary { background: #fff; color: #111827; }
  .action-bar .btn-primary:not([disabled]):hover { background: #f3f4f6; }
  .action-bar .btn-ghost { background: rgba(255,255,255,.12); color: #fff; }
  .action-bar .btn-ghost:not([disabled]):hover { background: rgba(255,255,255,.22); }

  /* Loading overlay */
  .loading-overlay {
    position: fixed; inset: 0; z-index: 9998;
    background: rgba(255,255,255,.96);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 14px;
    transition: opacity .25s ease, visibility .25s ease;
  }
  .loading-overlay.hidden { opacity: 0; visibility: hidden; pointer-events: none; }
  .loading-overlay .big-spinner {
    width: 40px; height: 40px; border-radius: 50%;
    border: 3px solid #e5e7eb; border-top-color: #7c3aed;
    animation: spin 1s linear infinite;
  }
  .loading-overlay .msg { color: #6b7280; font-size: 13px; font-weight: 600; letter-spacing: .3px; }
  .loading-overlay .sub { color: #9ca3af; font-size: 11px; }
</style>
</head>
<body>
<div class="loading-overlay no-print" id="rcm-loading">
  <div class="big-spinner"></div>
  <div class="msg">Preparing report preview…</div>
  <div class="sub">Save / Print actions activate when ready.</div>
</div>

<div class="action-bar no-print" id="rcm-actionbar">
  <div class="status" id="rcm-status">
    <div class="spinner" id="rcm-spinner"></div>
    <span id="rcm-status-text">Loading…</span>
  </div>
  <button type="button" class="btn-primary" id="rcm-save" disabled onclick="window.print()">⬇ Save as PDF</button>
  <button type="button" class="btn-ghost" id="rcm-print" disabled onclick="window.print()">🖨 Print</button>
</div>

<div class="wrap">
${body}
</div>

<script>
  (function () {
    var overlay = document.getElementById('rcm-loading');
    var spinner = document.getElementById('rcm-spinner');
    var statusText = document.getElementById('rcm-status-text');
    var statusEl = document.getElementById('rcm-status');
    var saveBtn = document.getElementById('rcm-save');
    var printBtn = document.getElementById('rcm-print');

    function ready() {
      if (overlay) overlay.classList.add('hidden');
      if (saveBtn) saveBtn.disabled = false;
      if (printBtn) printBtn.disabled = false;
      if (spinner) spinner.outerHTML = '<div class="ready-dot" id="rcm-spinner"></div>';
      if (statusText) statusText.textContent = 'Ready';
    }

    // Wait for fonts + images, then mark ready.
    function waitAssets() {
      var imgs = Array.prototype.slice.call(document.images || []);
      var imgPromise = Promise.all(imgs.map(function (img) {
        if (img.complete) return Promise.resolve();
        return new Promise(function (res) {
          img.addEventListener('load', res, { once: true });
          img.addEventListener('error', res, { once: true });
        });
      }));
      var fontPromise = (document.fonts && document.fonts.ready)
        ? document.fonts.ready
        : Promise.resolve();
      // Safety timeout: don't block longer than 4s.
      var timeoutPromise = new Promise(function (res) { setTimeout(res, 4000); });
      Promise.race([
        Promise.all([imgPromise, fontPromise]),
        timeoutPromise
      ]).then(function () {
        // Give layout one more frame to settle.
        requestAnimationFrame(function () { setTimeout(ready, 50); });
      });
    }

    if (document.readyState === 'complete') {
      waitAssets();
    } else {
      window.addEventListener('load', waitAssets, { once: true });
    }
  })();
</script>
</body>
</html>`;
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

function classify(c: Claim): "settled" | "denied" | "open" | "unsubmitted" {
  const k = (c.claim_status || "").toLowerCase();
  if (SETTLED.has(k)) return "settled";
  if (DENIED.has(k)) return "denied";
  if (SUBMITTED_NEGATIVE.has(k)) return "unsubmitted";
  return "open";
}

function ageDays(d?: string | null) {
  if (!d) return 0;
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

function inferDept(c: Claim): string {
  const t = `${c.diagnosis || ""} ${c.treatment || ""}`.toLowerCase();
  if (/cardio|heart|angio|cabg|stent/.test(t)) return "Cardiology";
  if (/onco|cancer|chemo|tumor|tumour/.test(t)) return "Oncology";
  if (/ortho|knee|hip|fracture|joint/.test(t)) return "Orthopaedics";
  if (/neuro|brain|stroke|spine/.test(t)) return "Neurology";
  if (/uro|kidney|renal|prostate/.test(t)) return "Urology";
  if (/nephr|dialysis/.test(t)) return "Nephrology";
  if (/gastr|liver|hepat|gi|colon/.test(t)) return "Gastroenterology";
  if (/ent|ear|nose|throat|sinus/.test(t)) return "ENT";
  return "General Surgery";
}

function computeMetrics(claims: Claim[]) {
  const total = claims.length;
  const claimed = claims.reduce((s, c) => s + (c.claimed_amount || 0), 0);
  const approved = claims.reduce((s, c) => s + (c.approved_amount || 0), 0);
  const settled = claims.reduce((s, c) => s + (c.settled_amount || 0), 0);
  const denials = claims.filter((c) => classify(c) === "denied");
  const settledClaims = claims.filter((c) => classify(c) === "settled");
  const unsubmitted = claims.filter((c) => classify(c) === "unsubmitted");
  const submitted = total - unsubmitted.length;
  const submittedAmt = claimed - unsubmitted.reduce((s, c) => s + (c.claimed_amount || 0), 0);
  const denialAmt = denials.reduce((s, c) => s + (c.claimed_amount || 0), 0);
  const underpayments = claims.reduce(
    (s, c) => s + Math.max(0, (c.approved_amount || 0) - (c.settled_amount || 0)),
    0,
  );
  const underpayCount = claims.filter((c) => (c.approved_amount || 0) - (c.settled_amount || 0) > 1).length;
  const unsubmittedAmt = unsubmitted.reduce((s, c) => s + (c.claimed_amount || 0), 0);
  const liveAR = claims
    .filter((c) => classify(c) !== "settled")
    .reduce((s, c) => s + (c.outstanding_amount || 0), 0);
  const livePending = claims.filter((c) => classify(c) !== "settled" && c.date_of_discharge).length;
  const ncr = approved > 0 ? (settled / approved) * 100 : 0;
  const denialRate = total > 0 ? (denials.length / total) * 100 : 0;
  const fpy = submitted > 0 ? ((submitted - denials.length) / submitted) * 100 : 0;

  // DIAR
  const dailyRevRun = claimed / 365;
  const diar = dailyRevRun > 0 ? liveAR / dailyRevRun : 0;

  // Aging buckets
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0 };
  const bucketCounts = { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0 };
  claims.forEach((c) => {
    if (classify(c) === "settled") return;
    const d = ageDays(c.claim_creation_date);
    const amt = c.outstanding_amount || 0;
    if (d <= 30) { buckets["0-30"] += amt; bucketCounts["0-30"]++; }
    else if (d <= 60) { buckets["31-60"] += amt; bucketCounts["31-60"]++; }
    else if (d <= 90) { buckets["61-90"] += amt; bucketCounts["61-90"]++; }
    else if (d <= 180) { buckets["91-180"] += amt; bucketCounts["91-180"]++; }
    else { buckets["180+"] += amt; bucketCounts["180+"]++; }
  });
  const irdaiBreach = claims.filter((c) => c.is_irdai_breach).length;
  const irdaiAmt = buckets["91-180"] + buckets["180+"];

  // Top TPA outstanding
  const tpaAgg: Record<string, { amt: number; count: number }> = {};
  claims.forEach((c) => {
    if (classify(c) === "settled") return;
    const k = c.tpa_name || "Unknown";
    if (!tpaAgg[k]) tpaAgg[k] = { amt: 0, count: 0 };
    tpaAgg[k].amt += c.outstanding_amount || 0;
    tpaAgg[k].count++;
  });
  const topTpa = Object.entries(tpaAgg).sort((a, b) => b[1].amt - a[1].amt).slice(0, 5);

  // Denial reasons
  const denialAgg: Record<string, { count: number; amt: number }> = {};
  denials.forEach((c) => {
    const reason = (c.insurer_comments || "Unspecified").split(/[.,;\n]/)[0].trim().slice(0, 60) || "Unspecified";
    if (!denialAgg[reason]) denialAgg[reason] = { count: 0, amt: 0 };
    denialAgg[reason].count++;
    denialAgg[reason].amt += c.claimed_amount || 0;
  });
  const topDenials = Object.entries(denialAgg).sort((a, b) => b[1].count - a[1].count).slice(0, 8);

  // Corporate / Group policies only — group by employer (policy_holder_name).
  // Excludes retail/individual policies and rows where the holder is the
  // insurer itself (i.e. retail policy issued in the insurer's name).
  const corpAgg: Record<string, { count: number; claimed: number; settled: number; denied: number; outstanding: number }> = {};
  claims.forEach((c) => {
    if (!isGroupCorporateClaim(c)) return;
    const k = normalizeCorporateName(c.policy_holder_name as string);
    if (!corpAgg[k]) corpAgg[k] = { count: 0, claimed: 0, settled: 0, denied: 0, outstanding: 0 };
    corpAgg[k].count++;
    corpAgg[k].claimed += c.claimed_amount || 0;
    corpAgg[k].settled += c.settled_amount || 0;
    corpAgg[k].outstanding += c.outstanding_amount || 0;
    if (classify(c) === "denied") corpAgg[k].denied++;
  });
  const topCorps = Object.entries(corpAgg).sort((a, b) => b[1].claimed - a[1].claimed).slice(0, 15);
  const corpClaimsCount = Object.values(corpAgg).reduce((s, v) => s + v.count, 0);
  const corpClaimedTotal = Object.values(corpAgg).reduce((s, v) => s + v.claimed, 0);
  const corpSettledTotal = Object.values(corpAgg).reduce((s, v) => s + v.settled, 0);
  const corpOutstandingTotal = Object.values(corpAgg).reduce((s, v) => s + v.outstanding, 0);

  // 48hr breach
  let breached48h = 0, dts = 0, dtsSum = 0;
  claims.forEach((c) => {
    if (c.date_of_discharge && c.doc_submission_date) {
      const d = (new Date(c.doc_submission_date).getTime() - new Date(c.date_of_discharge).getTime()) / 86_400_000;
      if (!Number.isNaN(d) && d >= 0) { dtsSum += d; dts++; if (d > 2) breached48h++; }
    }
  });
  const avgDts = dts > 0 ? dtsSum / dts : 0;

  return {
    total, claimed, approved, settled, denials, settledClaims,
    submitted, submittedAmt, denialAmt, underpayments, underpayCount, unsubmittedAmt, unsubmitted,
    liveAR, livePending, ncr, denialRate, fpy, diar,
    buckets, bucketCounts, irdaiBreach, irdaiAmt,
    topTpa, topDenials, topCorps, breached48h, avgDts,
    corpClaimsCount, corpClaimedTotal, corpSettledTotal, corpOutstandingTotal,
  };
}

/**
 * Returns true when the claim belongs to a GROUP / CORPORATE policy
 * (employer-sponsored). Excludes retail / individual policies and rows
 * where the policyholder is the insurer itself.
 */
function isGroupCorporateClaim(c: { policy_holder_name?: string | null; insurance_company_name?: string | null }): boolean {
  const raw = (c.policy_holder_name || "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();

  // Explicit retail / individual markers
  if (/\bretail\b|\bindividual\b/.test(lower)) return false;

  // Policyholder == insurer means it's a retail policy issued by the insurer
  const insurer = (c.insurance_company_name || "").toLowerCase().replace(/\bcompany\b|\blimited\b|\bltd\.?\b|\bco\.?\b|\bpvt\.?\b|\bprivate\b/g, "").trim();
  const holderClean = lower.replace(/\bcompany\b|\blimited\b|\bltd\.?\b|\bco\.?\b|\bpvt\.?\b|\bprivate\b/g, "").trim();
  if (insurer && holderClean && (insurer === holderClean || holderClean.includes(insurer) || insurer.includes(holderClean))) return false;

  // Insurer-style holder names (LIC, Max Life, etc.) — exclude
  if (/\b(insurance|assurance|life insurance|general insurance|health insurance|gic|lic)\b/.test(lower)) return false;

  // Corporate suffix / keyword whitelist
  const corpKeywords = /\b(ltd|limited|pvt|private|llp|inc|corporation|corp|services|solutions|technologies|technology|industries|consulting|consultancy|systems|enterprises|holdings|bank|labs|laboratories|pharma|healthcare|motors|infotech|software|global|business|sez|hyderabad sez|policy [a-z]|health assist|group)\b/i;
  if (corpKeywords.test(raw)) return true;

  // ALL CAPS multi-word names are typically corporates in this dataset
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && raw === raw.toUpperCase()) return true;

  return false;
}

/** Light name normalisation so minor formatting variants merge. */
function normalizeCorporateName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

// ────────────────────────── REPORT BUILDERS ──────────────────────────

function ceoReport(ctx: ReportContext): string {
  const m = computeMetrics(ctx.claims);
  const pctApproved = m.claimed > 0 ? (m.approved / m.claimed) * 100 : 0;
  const totalLeakage = m.denialAmt + m.underpayments + m.unsubmittedAmt;
  const ncrGapAmt = Math.max(0, m.approved * 0.8 - m.settled);
  const topDenialReason = m.topDenials[0]?.[0] || "—";

  const body = `
  <div class="header">
    <div class="logo">RC</div>
    <div>
      <div class="h-title">CEO / CFO Revenue Intelligence Report</div>
      <div class="h-sub">${escape(ctx.hospitalName)} · Period: ${escape(ctx.periodLabel)} · Generated ${todayLong()} · ${m.total.toLocaleString("en-IN")} claims</div>
    </div>
  </div>

  <div class="section-title">FINANCIAL SNAPSHOT</div>
  <div class="grid-4">
    <div class="kpi"><div class="l">Total Claimed</div><div class="v">${fmt(m.claimed)}</div><div class="c">${m.total} claims</div></div>
    <div class="kpi"><div class="l">Insurer Approved</div><div class="v">${fmt(m.approved)}</div><div class="c">${pctApproved.toFixed(0)}% of claimed</div></div>
    <div class="kpi"><div class="l">Cash Collected</div><div class="v">${fmt(m.settled)}</div><div class="c">${m.settledClaims.length} settled</div></div>
    <div class="kpi"><div class="l">Live AR Portfolio</div><div class="v">${fmt(m.liveAR)}</div><div class="c">${m.livePending} pending</div></div>
    <div class="kpi"><div class="l">Net Collection Rate</div><div class="v ${m.ncr >= 80 ? "emerald" : "amber"}">${m.ncr.toFixed(1)}%</div><div class="c">Target ≥ 80%</div></div>
    <div class="kpi"><div class="l">Denial Rate</div><div class="v ${m.denialRate < 15 ? "emerald" : "red"}">${m.denialRate.toFixed(1)}%</div><div class="c">${m.denials.length} denied · Target &lt;15%</div></div>
    <div class="kpi"><div class="l">Days in AR (DIAR)</div><div class="v ${m.diar <= 30 ? "emerald" : "red"}">${Math.round(m.diar)}d</div><div class="c">Avg outstanding · Target ≤30d</div></div>
    <div class="kpi"><div class="l">SLA 90+ Breach</div><div class="v ${m.irdaiBreach === 0 ? "emerald" : "red"}">${m.irdaiBreach}</div><div class="c">${fmt(m.irdaiAmt)} at risk</div></div>
  </div>

  <div class="section-title">REVENUE FUNNEL — CLAIMED → SUBMITTED → APPROVED → COLLECTED</div>
  <div class="funnel">
    <div class="step" style="background:#3b82f6"><div class="l">Total Claimed</div><div class="v">${fmt(m.claimed)}</div><div class="p">100%</div><div class="c">${m.total} claims</div></div>
    <div class="step" style="background:#6366f1"><div class="l">Submitted</div><div class="v">${fmt(m.submittedAmt)}</div><div class="p">${m.claimed > 0 ? ((m.submittedAmt / m.claimed) * 100).toFixed(1) : 0}%</div><div class="c">${m.submitted} claims</div></div>
    <div class="step" style="background:#f59e0b"><div class="l">Approved</div><div class="v">${fmt(m.approved)}</div><div class="p">${m.claimed > 0 ? ((m.approved / m.claimed) * 100).toFixed(1) : 0}%</div><div class="c">${ctx.claims.filter(c => c.approved_amount > 0).length} claims</div></div>
    <div class="step" style="background:#10b981"><div class="l">Collected</div><div class="v">${fmt(m.settled)}</div><div class="p">${m.claimed > 0 ? ((m.settled / m.claimed) * 100).toFixed(1) : 0}%</div><div class="c">${m.settledClaims.length} settled</div></div>
  </div>

  <div class="section-title">REVENUE LEAKAGE</div>
  <table>
    <thead><tr><th>Category</th><th class="num">Amount</th><th class="num">Count</th></tr></thead>
    <tbody>
      <tr><td>❌ Denials</td><td class="num">${fmt(m.denialAmt)}</td><td class="num">${m.denials.length}</td></tr>
      <tr><td>⚠ Underpayments</td><td class="num">${fmt(m.underpayments)}</td><td class="num">${m.underpayCount}</td></tr>
      <tr><td>Docs Not Submitted</td><td class="num">${fmt(m.unsubmittedAmt)}</td><td class="num">${m.unsubmitted.length}</td></tr>
      <tr class="total-row"><td><b>Total Leakage</b></td><td class="num"><b>${fmt(totalLeakage)}</b></td><td class="num">—</td></tr>
    </tbody>
  </table>

  <div class="section-title">TOP 5 TPA BY AR OUTSTANDING</div>
  <table>
    <thead><tr><th>#</th><th>TPA / Insurer</th><th class="num">Claims</th><th class="num">Outstanding</th></tr></thead>
    <tbody>
      ${m.topTpa.map(([name, v], i) => `<tr><td>${i + 1}</td><td><b>${escape(name)}</b></td><td class="num">${v.count}</td><td class="num"><b>${fmt(v.amt)}</b></td></tr>`).join("")}
    </tbody>
  </table>

  <div style="page-break-before: always;"></div>

  <div class="section-title">EXPERT RCM INSIGHTS</div>
  <div class="insight">
    <h4>COLLECTION EFFICIENCY</h4>
    <p>NCR of ${m.ncr.toFixed(1)}% ${m.ncr >= 80 ? "meets" : "is below"} the 80% target. ${m.ncr < 80 ? `The ${(80 - m.ncr).toFixed(1)}% gap represents ${fmt(ncrGapAmt)} in recoverable value.` : "Maintain TPA reconciliation discipline."} Prioritise aged AR follow-up and underpayment disputes.</p>
  </div>
  <div class="insight">
    <h4>DENIAL PATTERN</h4>
    <p>Denial rate of ${m.denialRate.toFixed(1)}% ${m.denialRate < 15 ? "is within tolerance." : "needs attention."} Top denial reasons: ${m.topDenials.slice(0, 2).map(([r, v]) => `${escape(r)} (${v.count})`).join(", ") || "—"}. Conduct root-cause training for documentation staff on the top categories.</p>
  </div>
  <div class="insight">
    <h4>AR AGING VELOCITY</h4>
    <p>DIAR of ${Math.round(m.diar)} days is ${m.diar <= 30 ? "within the ideal" : "outside the"} 30-day window. AR is ${m.diar <= 30 ? "moving efficiently" : "ageing — review collection cadence"}. First Pass Yield (FPY) is ${m.fpy.toFixed(0)}% — ${m.fpy >= 85 ? "excellent" : m.fpy >= 70 ? "acceptable, target improvement" : "rework high, review docs checklist"}.</p>
  </div>

  <div class="section-title">BOARD-LEVEL ACTION PLAN</div>
  <div class="action">
    <div>
      <h4>File Appeals — ${m.denials.length} denied claims before 30-day window expires</h4>
      <p>Top denial reason: ${escape(topDenialReason)} (${m.topDenials[0]?.[1].count || 0} claims). Prioritise by amount — use the Denial Tracker in RCM Buddy for one-click appeal filing. Responsible: Appeals Team.</p>
    </div>
    <div class="amt">${fmt(m.denialAmt)}</div>
  </div>
  <div class="action">
    <div>
      <h4>NCR Recovery — Schedule TPA performance review for top AR accounts</h4>
      <p>NCR of ${m.ncr.toFixed(1)}% is below the 75% threshold. Request settlement statements from top 3 TPAs. Identify underpayment patterns and raise formal discrepancy notices. Responsible: RCM Head + Finance.</p>
    </div>
    <div class="amt">${fmt(m.underpayments)}</div>
  </div>

  ${m.breached48h > 0 ? `
  <div class="section-title">AUTO-FLAG RISK ALERTS</div>
  <div class="alert">
    <h4>${m.breached48h} claim(s) submitted after 48-hour window</h4>
    <p>Discharge-to-submission avg: ${m.avgDts.toFixed(1)} days. Insurer may reject on timing grounds.</p>
  </div>` : ""}

  <div class="footer">RCM Buddy v3 — Confidential Management Report — ${escape(ctx.hospitalName)}<br/>Generated ${todayLong()} · Period: ${escape(ctx.periodLabel)} · ${m.total.toLocaleString("en-IN")} claims</div>
  `;
  return pageShell(`CEO Report — ${ctx.hospitalName}`, body);
}

function arReport(ctx: ReportContext): string {
  const m = computeMetrics(ctx.claims);
  const totalAR = Object.values(m.buckets).reduce((s, v) => s + v, 0) || 1;
  const showIrdaiList = ctx.includeIrdaiBreachList === true;
  const irdaiList = !showIrdaiList ? [] : ctx.claims
    .filter((c) => c.is_irdai_breach || ageDays(c.claim_creation_date) >= 90)
    .filter((c) => classify(c) !== "settled")
    .sort((a, b) => (b.outstanding_amount || 0) - (a.outstanding_amount || 0))
    .slice(0, 25);

  // TPA-wise aging buckets (outstanding amount per bucket per TPA)
  type TpaAging = {
    "0-30": number; "31-60": number; "61-90": number; "91-180": number; "180+": number;
    total: number; count: number;
  };
  const tpaAging: Record<string, TpaAging> = {};
  ctx.claims.forEach((c) => {
    if (classify(c) === "settled") return;
    const k = c.tpa_name || "Unknown";
    if (!tpaAging[k]) tpaAging[k] = { "0-30": 0, "31-60": 0, "61-90": 0, "91-180": 0, "180+": 0, total: 0, count: 0 };
    const d = ageDays(c.claim_creation_date);
    const amt = c.outstanding_amount || 0;
    if (d <= 30) tpaAging[k]["0-30"] += amt;
    else if (d <= 60) tpaAging[k]["31-60"] += amt;
    else if (d <= 90) tpaAging[k]["61-90"] += amt;
    else if (d <= 180) tpaAging[k]["91-180"] += amt;
    else tpaAging[k]["180+"] += amt;
    tpaAging[k].total += amt;
    tpaAging[k].count++;
  });
  const tpaAgingRows = Object.entries(tpaAging)
    .sort((a, b) => b[1].total - a[1].total);

  const body = `
  <div class="header">
    <div class="logo">RC</div>
    <div>
      <div class="h-title">AR Aging Report</div>
      <div class="h-sub">${escape(ctx.hospitalName)} · Period: ${escape(ctx.periodLabel)} · Generated ${todayLong()}</div>
    </div>
  </div>

  <div class="section-title">AR AGING BUCKETS</div>
  <div class="grid-4">
    ${Object.entries(m.buckets).slice(0, 4).map(([k, v]) => `
      <div class="kpi"><div class="l">${k} Days</div><div class="v">${fmt(v)}</div><div class="c">${m.bucketCounts[k as keyof typeof m.bucketCounts]} claims · ${((v / totalAR) * 100).toFixed(0)}% of AR</div></div>
    `).join("")}
  </div>
  <div style="margin-top: 8px;">
    <div class="kpi" style="border-color:#fecaca;background:#fef2f2"><div class="l red">180+ DAYS · CRITICAL</div><div class="v red">${fmt(m.buckets["180+"])}</div><div class="c">${m.bucketCounts["180+"]} claims · ${((m.buckets["180+"] / totalAR) * 100).toFixed(0)}% of AR · SLA risk</div></div>
  </div>

  <div class="section-title">TPA-WISE AR AGING BUCKETS</div>
  ${tpaAgingRows.length === 0 ? '<p style="color:#6b7280">No outstanding AR by TPA.</p>' : `
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>TPA / Insurer</th>
        <th class="num">Claims</th>
        <th class="num">0-30</th>
        <th class="num">31-60</th>
        <th class="num">61-90</th>
        <th class="num">91-180</th>
        <th class="num">180+</th>
        <th class="num">Total Outstanding</th>
      </tr>
    </thead>
    <tbody>
      ${tpaAgingRows.map(([n, v], i) => `
        <tr>
          <td>${i + 1}</td>
          <td><b>${escape(n)}</b></td>
          <td class="num">${v.count}</td>
          <td class="num">${fmt(v["0-30"])}</td>
          <td class="num">${fmt(v["31-60"])}</td>
          <td class="num">${fmt(v["61-90"])}</td>
          <td class="num">${fmt(v["91-180"])}</td>
          <td class="num red"><b>${fmt(v["180+"])}</b></td>
          <td class="num"><b>${fmt(v.total)}</b></td>
        </tr>
      `).join("")}
      <tr style="background:#f9fafb;font-weight:700">
        <td></td>
        <td>TOTAL</td>
        <td class="num">${tpaAgingRows.reduce((s, [, v]) => s + v.count, 0)}</td>
        <td class="num">${fmt(m.buckets["0-30"])}</td>
        <td class="num">${fmt(m.buckets["31-60"])}</td>
        <td class="num">${fmt(m.buckets["61-90"])}</td>
        <td class="num">${fmt(m.buckets["91-180"])}</td>
        <td class="num red">${fmt(m.buckets["180+"])}</td>
        <td class="num">${fmt(totalAR)}</td>
      </tr>
    </tbody>
  </table>`}

  ${!showIrdaiList ? "" : `
  <div class="section-title">SLA 30-DAY BREACH LIST · TOP 25</div>
  ${irdaiList.length === 0 ? '<p style="color:#6b7280">✓ No claims breaching SLA 30-day TAT.</p>' : `
  <table>
    <thead><tr><th>Claim #</th><th>TPA</th><th>Patient</th><th class="num">Days</th><th class="num">Outstanding</th></tr></thead>
    <tbody>
      ${irdaiList.map((c) => `<tr><td>${escape(c.claim_number)}</td><td>${escape(c.tpa_name)}</td><td>${escape(c.patient_name)}</td><td class="num red"><b>${ageDays(c.claim_creation_date)}d</b></td><td class="num"><b>${fmt(c.outstanding_amount || 0)}</b></td></tr>`).join("")}
    </tbody>
  </table>`}`}

  <div class="footer">RCM Buddy v3 — AR Aging Report — ${escape(ctx.hospitalName)}<br/>Generated ${todayLong()} · Period: ${escape(ctx.periodLabel)}</div>
  `;
  return pageShell(`AR Aging — ${ctx.hospitalName}`, body);
}

function denialReport(ctx: ReportContext): string {
  const m = computeMetrics(ctx.claims);
  const recoverableAmt = m.denialAmt;
  const top20 = m.denials.slice().sort((a, b) => (b.claimed_amount || 0) - (a.claimed_amount || 0)).slice(0, 20);

  const body = `
  <div class="header">
    <div class="logo">RC</div>
    <div>
      <div class="h-title">Denial &amp; Appeal Report</div>
      <div class="h-sub">${escape(ctx.hospitalName)} · Period: ${escape(ctx.periodLabel)} · Generated ${todayLong()}</div>
    </div>
  </div>

  <div class="section-title">DENIAL SNAPSHOT</div>
  <div class="grid-4">
    <div class="kpi"><div class="l">Total Denied</div><div class="v red">${m.denials.length}</div><div class="c">${m.denialRate.toFixed(1)}% denial rate</div></div>
    <div class="kpi"><div class="l">Denied Amount</div><div class="v red">${fmt(m.denialAmt)}</div><div class="c">recoverable opportunity</div></div>
    <div class="kpi"><div class="l">Underpayments</div><div class="v amber">${fmt(m.underpayments)}</div><div class="c">${m.underpayCount} short-paid</div></div>
    <div class="kpi"><div class="l">Total Recovery</div><div class="v emerald">${fmt(recoverableAmt + m.underpayments)}</div><div class="c">denials + underpayments</div></div>
  </div>

  <div class="section-title">DENIAL CATEGORIES (ROOT CAUSE)</div>
  <table>
    <thead><tr><th>#</th><th>Reason / Category</th><th class="num">Count</th><th class="num">Amount</th><th>Status</th></tr></thead>
    <tbody>
      ${m.topDenials.map(([reason, v], i) => `<tr><td>${i + 1}</td><td>${escape(reason)}</td><td class="num">${v.count}</td><td class="num"><b>${fmt(v.amt)}</b></td><td><span class="pill pill-amber">Appeal pending</span></td></tr>`).join("")}
    </tbody>
  </table>

  <div class="section-title">TOP 20 DENIED CLAIMS — APPEAL PRIORITY</div>
  <table>
    <thead><tr><th>Claim #</th><th>Patient</th><th>TPA</th><th class="num">Claimed</th><th>Reason</th></tr></thead>
    <tbody>
      ${top20.map((c) => `<tr><td>${escape(c.claim_number)}</td><td>${escape(c.patient_name)}</td><td>${escape(c.tpa_name)}</td><td class="num"><b>${fmt(c.claimed_amount || 0)}</b></td><td>${escape((c.insurer_comments || "—").slice(0, 50))}</td></tr>`).join("")}
    </tbody>
  </table>

  <div class="section-title">RECOVERY OPPORTUNITY</div>
  <div class="action">
    <div>
      <h4>File appeals before 30-day SLA window expires</h4>
      <p>${m.denials.length} denied claims. Use Denial Tracker → AI Appeal Generator for fastest turnaround. Top reason: ${escape(m.topDenials[0]?.[0] || "—")} (${m.topDenials[0]?.[1].count || 0} claims).</p>
    </div>
    <div class="amt">${fmt(recoverableAmt)}</div>
  </div>

  <div class="footer">RCM Buddy v3 — Denial &amp; Appeal Report — ${escape(ctx.hospitalName)}</div>
  `;
  return pageShell(`Denials — ${ctx.hospitalName}`, body);
}

function corporateReport(ctx: ReportContext): string {
  const m = computeMetrics(ctx.claims);

  const body = `
  <div class="header">
    <div class="logo">RC</div>
    <div>
      <div class="h-title">Corporate Performance Report</div>
      <div class="h-sub">${escape(ctx.hospitalName)} · Period: ${escape(ctx.periodLabel)} · Generated ${todayLong()}</div>
    </div>
  </div>

  <div class="section-title">CORPORATE / GROUP POLICY PERFORMANCE</div>
  <p style="font-size:11px;color:#555;margin:-6px 0 8px">
    Group / employer-sponsored policies only. Retail &amp; individual policies are excluded.
    Claims are grouped by Policy Holder Name (the corporate / employer), not by insurer.
  </p>
  <table>
    <thead><tr><th>#</th><th>Corporate / Employer</th><th class="num">Claims</th><th class="num">Billed</th><th class="num">Settled</th><th class="num">Outstanding</th><th class="num">NCR</th><th class="num">Denied</th></tr></thead>
    <tbody>
      ${m.topCorps.length === 0
        ? `<tr><td colspan="8" style="text-align:center;color:#888;padding:18px">No group / corporate policy claims found in the selected period.</td></tr>`
        : m.topCorps.map(([name, v], i) => {
            const ncr = v.claimed > 0 ? (v.settled / v.claimed) * 100 : 0;
            return `<tr>
              <td>${i + 1}</td>
              <td><b>${escape(name)}</b></td>
              <td class="num">${v.count}</td>
              <td class="num">${fmt(v.claimed)}</td>
              <td class="num emerald">${fmt(v.settled)}</td>
              <td class="num red">${fmt(v.outstanding)}</td>
              <td class="num"><b>${ncr.toFixed(1)}%</b></td>
              <td class="num">${v.denied}</td>
            </tr>`;
          }).join("")}
    </tbody>
  </table>

  <div class="section-title">CORPORATE PORTFOLIO TOTALS</div>
  <div class="grid-4">
    <div class="kpi"><div class="l">Group Claims</div><div class="v">${m.corpClaimsCount}</div><div class="c">${m.topCorps.length} employers</div></div>
    <div class="kpi"><div class="l">Total Billed</div><div class="v">${fmt(m.corpClaimedTotal)}</div><div class="c">group policies</div></div>
    <div class="kpi"><div class="l">Total Settled</div><div class="v emerald">${fmt(m.corpSettledTotal)}</div><div class="c">${m.corpClaimedTotal > 0 ? ((m.corpSettledTotal / m.corpClaimedTotal) * 100).toFixed(1) : "0.0"}% NCR</div></div>
    <div class="kpi"><div class="l">Outstanding</div><div class="v red">${fmt(m.corpOutstandingTotal)}</div><div class="c">group AR</div></div>
  </div>

  <div class="footer">RCM Buddy v3 — Corporate Performance Report (Group Policies Only) — ${escape(ctx.hospitalName)}</div>
  `;
  return pageShell(`Corporate — ${ctx.hospitalName}`, body);
}

/**
 * Returns the inner body HTML for a single report (without the page shell).
 * Used to compose multi-report combined PDFs. We anchor on the page shell's
 * trailing `<script>` block so nested `</div>` tags inside the wrap are
 * preserved correctly.
 */
export function reportBody(kind: ReportKind, ctx: ReportContext): string {
  const html = buildReport(kind, ctx);
  const m = html.match(/<div class="wrap">([\s\S]*?)<\/div>\s*<script>/);
  return m ? m[1] : html;
}

const REPORT_TITLES: Record<ReportKind, string> = {
  ceo: "CEO / CFO Revenue Intelligence",
  ar: "AR Aging Report",
  denial: "Denial & Appeal Report",
  corporate: "Corporate Performance Report",
};

export function buildReport(kind: ReportKind, ctx: ReportContext): string {
  switch (kind) {
    case "ceo": return ceoReport(ctx);
    case "ar": return arReport(ctx);
    case "denial": return denialReport(ctx);
    case "corporate": return corporateReport(ctx);
  }
}

/** Build a single combined PDF containing the bodies of multiple reports. */
export function buildCombinedReport(kinds: ReportKind[], ctx: ReportContext): string {
  const sections = kinds.map((k, i) => `
    ${i > 0 ? '<div style="page-break-before: always;"></div>' : ""}
    ${reportBody(k, ctx)}
  `).join("");

  const cover = `
  <div class="header">
    <div class="logo">RC</div>
    <div>
      <div class="h-title">Smart Report Pack</div>
      <div class="h-sub">${escape(ctx.hospitalName)} · Period: ${escape(ctx.periodLabel)} · Generated ${todayLong()}</div>
    </div>
  </div>
  <div class="section-title">CONTENTS</div>
  <table>
    <thead><tr><th>#</th><th>Report</th></tr></thead>
    <tbody>
      ${kinds.map((k, i) => `<tr><td>${i + 1}</td><td><b>${escape(REPORT_TITLES[k])}</b></td></tr>`).join("")}
    </tbody>
  </table>
  <p style="font-size:10.5px;color:#6b7280;margin-top:10px">
    ${ctx.claims.length.toLocaleString("en-IN")} claims included · ${kinds.length} report${kinds.length > 1 ? "s" : ""}.
  </p>
  <div style="page-break-before: always;"></div>
  `;

  return pageShell(`Smart Report Pack — ${ctx.hospitalName}`, cover + sections);
}

export function openReportInNewTab(kind: ReportKind, ctx: ReportContext) {
  openHtmlInNewTab(buildReport(kind, ctx), `${kind}-report-${Date.now()}.html`);
}

export function openCombinedReportInNewTab(kinds: ReportKind[], ctx: ReportContext) {
  openHtmlInNewTab(buildCombinedReport(kinds, ctx), `smart-report-pack-${Date.now()}.html`);
}

function openHtmlInNewTab(html: string, fallbackName: string) {
  const win = window.open("", "_blank");
  if (!win) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

