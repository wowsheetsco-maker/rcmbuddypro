import type { Claim } from "@/data/mockClaims";
import { DENIED_STATUSES, SETTLED_STATUSES } from "./payerScorecard";

/**
 * Time-series + segment aggregations for the Trends & Analytics dashboard.
 * Everything is derived from a snapshot of claims so charts stay reactive.
 */

/** YYYY-MM key from a date string, or "Unknown" if not parseable. */
function monthKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export interface MonthlyPoint {
  month: string;        // YYYY-MM
  label: string;        // "Apr 25"
  billed: number;
  approved: number;
  settled: number;
  outstanding: number;
  claims: number;
  denied: number;
  ncrPct: number;       // settled / billed × 100
  approvalPct: number;  // approved / billed × 100
  denialPct: number;    // deniedCount / claims × 100
  growthPct: number;    // MoM settled growth — filled in second pass
}

/** Build full monthly time series from claim_creation_date. */
export function buildMonthlySeries(claims: Claim[]): MonthlyPoint[] {
  const map = new Map<string, Omit<MonthlyPoint, "label" | "ncrPct" | "approvalPct" | "denialPct" | "growthPct">>();
  for (const c of claims) {
    const k = monthKey(c.claim_creation_date);
    if (!k) continue;
    let e = map.get(k);
    if (!e) {
      e = { month: k, billed: 0, approved: 0, settled: 0, outstanding: 0, claims: 0, denied: 0 };
      map.set(k, e);
    }
    e.billed += c.claimed_amount || 0;
    e.approved += c.approved_amount || 0;
    e.settled += c.settled_amount || 0;
    e.outstanding += c.outstanding_amount || 0;
    e.claims += 1;
    const status = (c.claim_status || "").toLowerCase().trim();
    if (DENIED_STATUSES.has(status)) e.denied += 1;
  }

  const sorted = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  return sorted.map((e, i): MonthlyPoint => {
    const ncrPct = e.billed ? +((e.settled / e.billed) * 100).toFixed(1) : 0;
    const approvalPct = e.billed ? +((e.approved / e.billed) * 100).toFixed(1) : 0;
    const denialPct = e.claims ? +((e.denied / e.claims) * 100).toFixed(1) : 0;
    const prev = sorted[i - 1];
    const growthPct = prev && prev.settled
      ? +(((e.settled - prev.settled) / prev.settled) * 100).toFixed(1)
      : 0;
    return { ...e, label: monthLabel(e.month), ncrPct, approvalPct, denialPct, growthPct };
  });
}

/* ---------- Insurer / TPA segmentation ---------- */

export interface InsurerTrendRow {
  name: string;
  claims: number;
  billed: number;
  settled: number;
  outstanding: number;
  ncrPct: number;
  share: number; // % of total billed
}

export function buildInsurerTrend(claims: Claim[], dimension: "tpa" | "insurer" = "insurer"): InsurerTrendRow[] {
  const map = new Map<string, { billed: number; settled: number; outstanding: number; claims: number }>();
  for (const c of claims) {
    const key = (dimension === "insurer"
      ? c.insurance_company_name
      : c.tpa_name) || "Unknown";
    let e = map.get(key);
    if (!e) { e = { billed: 0, settled: 0, outstanding: 0, claims: 0 }; map.set(key, e); }
    e.billed += c.claimed_amount || 0;
    e.settled += c.settled_amount || 0;
    e.outstanding += c.outstanding_amount || 0;
    e.claims += 1;
  }
  const totalBilled = Array.from(map.values()).reduce((s, e) => s + e.billed, 0);
  return Array.from(map.entries())
    .map(([name, e]): InsurerTrendRow => ({
      name,
      claims: e.claims,
      billed: e.billed,
      settled: e.settled,
      outstanding: e.outstanding,
      ncrPct: e.billed ? +((e.settled / e.billed) * 100).toFixed(1) : 0,
      share: totalBilled ? +((e.billed / totalBilled) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.billed - a.billed);
}

/* ---------- Department / specialty segmentation ----------
 * We don't have an explicit "department" column; we derive it from the
 * `treatment` text. This is a pragmatic mapping that covers the most common
 * specialties in Indian hospital claim data — easy to extend later.
 */

export type Department =
  | "Cardiology" | "Orthopaedics" | "Oncology" | "Neurology" | "Nephrology"
  | "Urology" | "Gastroenterology" | "Gynaecology" | "Paediatrics" | "ENT"
  | "Ophthalmology" | "Pulmonology" | "General Medicine" | "General Surgery"
  | "Other / Unspecified";

const DEPT_KEYWORDS: Array<[Department, RegExp]> = [
  ["Cardiology", /cardio|angio|stent|chest pain|mi\b|infarct|cabg|heart|coronary/i],
  ["Oncology", /cancer|chemo|onco|carcinoma|tumor|tumour|malign/i],
  ["Orthopaedics", /ortho|fracture|joint|knee|hip|spine|disc|arthro|trauma/i],
  ["Neurology", /neuro|stroke|tia|seizure|epilep|paralys|brain/i],
  ["Nephrology", /nephro|dialys|kidney|renal/i],
  ["Urology", /urolo|prostate|bladder|kidney stone|tur[bp]/i],
  ["Gastroenterology", /gastro|liver|hepat|colon|appendi|gall|cholecyst|pancrea/i],
  ["Gynaecology", /gynae|obstet|delivery|c-?section|caesar|hysterect|preg/i],
  ["Paediatrics", /paed|pedia|neonat|infant|child/i],
  ["ENT", /\bent\b|tonsil|sinus|nasal|throat|ear/i],
  ["Ophthalmology", /eye|ophthal|cataract|retina|lasik/i],
  ["Pulmonology", /pulmo|copd|asthma|lung|pneumon|tubercul|tb\b/i],
  ["General Surgery", /hernia|surger|laparotom|appendect|excision/i],
  ["General Medicine", /fever|viral|dengue|typhoid|malaria|infection|gastroenteritis|diabet|hypertens/i],
];

export function classifyDepartment(treatment: string | null | undefined, diagnosis: string | null | undefined): Department {
  const text = `${treatment || ""} ${diagnosis || ""}`.trim();
  if (!text) return "Other / Unspecified";
  for (const [dept, re] of DEPT_KEYWORDS) {
    if (re.test(text)) return dept;
  }
  return "Other / Unspecified";
}

export interface DepartmentTrendRow {
  department: Department;
  claims: number;
  billed: number;
  settled: number;
  outstanding: number;
  ncrPct: number;
  share: number;
}

export function buildDepartmentTrend(claims: Claim[]): DepartmentTrendRow[] {
  const map = new Map<Department, { billed: number; settled: number; outstanding: number; claims: number }>();
  for (const c of claims) {
    const dept = classifyDepartment(c.treatment, c.diagnosis);
    let e = map.get(dept);
    if (!e) { e = { billed: 0, settled: 0, outstanding: 0, claims: 0 }; map.set(dept, e); }
    e.billed += c.claimed_amount || 0;
    e.settled += c.settled_amount || 0;
    e.outstanding += c.outstanding_amount || 0;
    e.claims += 1;
  }
  const totalBilled = Array.from(map.values()).reduce((s, e) => s + e.billed, 0);
  return Array.from(map.entries())
    .map(([department, e]): DepartmentTrendRow => ({
      department,
      claims: e.claims,
      billed: e.billed,
      settled: e.settled,
      outstanding: e.outstanding,
      ncrPct: e.billed ? +((e.settled / e.billed) * 100).toFixed(1) : 0,
      share: totalBilled ? +((e.billed / totalBilled) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.billed - a.billed);
}

/* ---------- Denial trend over time ---------- */

export interface DenialMonthlyPoint {
  month: string;
  label: string;
  totalClaims: number;
  deniedClaims: number;
  deniedAmount: number;
  denialRate: number; // %
}

export function buildDenialTrend(claims: Claim[]): DenialMonthlyPoint[] {
  const map = new Map<string, { total: number; denied: number; deniedAmount: number }>();
  for (const c of claims) {
    const k = monthKey(c.claim_creation_date);
    if (!k) continue;
    let e = map.get(k);
    if (!e) { e = { total: 0, denied: 0, deniedAmount: 0 }; map.set(k, e); }
    e.total += 1;
    const status = (c.claim_status || "").toLowerCase().trim();
    if (DENIED_STATUSES.has(status)) {
      e.denied += 1;
      // Approximate "amount at risk" as claimed when fully denied, else short-pay
      e.deniedAmount += c.approved_amount > 0
        ? Math.max((c.claimed_amount || 0) - (c.approved_amount || 0), c.outstanding_amount || 0)
        : (c.claimed_amount || 0);
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, e]): DenialMonthlyPoint => ({
      month,
      label: monthLabel(month),
      totalClaims: e.total,
      deniedClaims: e.denied,
      deniedAmount: e.deniedAmount,
      denialRate: e.total ? +((e.denied / e.total) * 100).toFixed(1) : 0,
    }));
}

/* ---------- Headline KPIs for the trends page ---------- */

export interface TrendsKpis {
  monthsTracked: number;
  totalBilled: number;
  totalSettled: number;
  totalOutstanding: number;
  avgNcrPct: number;
  bestMonth: { label: string; settled: number } | null;
  worstMonth: { label: string; ncrPct: number } | null;
  momGrowthPct: number;     // last completed month vs prior
  denialRatePct: number;    // overall
}

export function buildTrendsKpis(claims: Claim[], monthly: MonthlyPoint[]): TrendsKpis {
  const totalBilled = claims.reduce((s, c) => s + (c.claimed_amount || 0), 0);
  const totalSettled = claims.reduce((s, c) => s + (c.settled_amount || 0), 0);
  const totalOutstanding = claims.reduce((s, c) => s + (c.outstanding_amount || 0), 0);
  const denied = claims.filter((c) => DENIED_STATUSES.has((c.claim_status || "").toLowerCase().trim())).length;

  let best: { label: string; settled: number } | null = null;
  let worst: { label: string; ncrPct: number } | null = null;
  for (const m of monthly) {
    if (!best || m.settled > best.settled) best = { label: m.label, settled: m.settled };
    if (m.billed > 0 && (!worst || m.ncrPct < worst.ncrPct)) worst = { label: m.label, ncrPct: m.ncrPct };
  }

  const tail = monthly.slice(-1)[0];
  return {
    monthsTracked: monthly.length,
    totalBilled,
    totalSettled,
    totalOutstanding,
    avgNcrPct: totalBilled ? +((totalSettled / totalBilled) * 100).toFixed(1) : 0,
    bestMonth: best,
    worstMonth: worst,
    momGrowthPct: tail?.growthPct ?? 0,
    denialRatePct: claims.length ? +((denied / claims.length) * 100).toFixed(1) : 0,
  };
}
