import { mockClaims, type Claim } from "@/data/mockClaims";
import { DENIAL_CODES, mapToDenialCode, type DenialCategory, type DenialCode } from "@/data/denialCodes";

/** Source of claims used by analytics. Defaults to mockClaims for backwards
 * compatibility, but pages should pass the live `claims` array from
 * `useLiveClaims()` so numbers reflect real imported data. */
type ClaimSource = readonly Claim[];
const src = (claims?: ClaimSource): readonly Claim[] => claims ?? mockClaims;

export interface DenialRow {
  claim: Claim;
  code: DenialCode;
  shortPaid: number; // claimed - approved (or outstanding for fully denied)
}

export interface InsurerDenialStat {
  name: string;
  totalClaims: number;
  deniedClaims: number;
  denialRate: number; // 0-1
  amountAtRisk: number;
  avgRecoveryRate: number;
  firstPassResolved: number;
  firstPassRate: number; // 0-1
}

export interface CategoryStat {
  category: DenialCategory;
  count: number;
  amountAtRisk: number;
  avgRecoveryRate: number;
}

export interface CodeStat {
  code: DenialCode;
  count: number;
  amountAtRisk: number;
}

function isDeniedStatus(s: string) {
  const x = s.toLowerCase();
  return x.includes("deni") || x.includes("query") || x.includes("reject");
}

function isFirstPassResolved(c: Claim): boolean {
  // Heuristic: settled or approved without going through denial/query path
  const s = c.claim_status.toLowerCase();
  if (s.includes("deni") || s.includes("query") || s.includes("reject")) return false;
  if (s.includes("settled") || s.includes("approved") || s.includes("settlement initiated")) return true;
  return false;
}

export function getDenialRows(claims?: ClaimSource): DenialRow[] {
  const rows: DenialRow[] = [];
  for (const claim of src(claims)) {
    const code = mapToDenialCode(claim.claim_status, claim.insurer_comments);
    if (!code) continue;
    const shortPaid = claim.approved_amount > 0
      ? Math.max(claim.claimed_amount - claim.approved_amount, claim.outstanding_amount)
      : claim.claimed_amount;
    rows.push({ claim, code, shortPaid });
  }
  return rows;
}

export function getInsurerStats(claims?: ClaimSource): InsurerDenialStat[] {
  const groups = new Map<string, Claim[]>();
  for (const c of src(claims)) {
    const key = c.tpa_name || c.insurance_company_name || "Unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  const rows: InsurerDenialStat[] = [];
  for (const [name, claims] of groups) {
    const denied = claims.filter(c => isDeniedStatus(c.claim_status));
    const firstPass = claims.filter(isFirstPassResolved).length;
    const recoveries = denied
      .map(c => mapToDenialCode(c.claim_status, c.insurer_comments)?.recoveryRate ?? 0);
    const avgRecovery = recoveries.length ? recoveries.reduce((a, b) => a + b, 0) / recoveries.length : 0;
    rows.push({
      name: name.length > 30 ? name.slice(0, 28) + "…" : name,
      totalClaims: claims.length,
      deniedClaims: denied.length,
      denialRate: claims.length ? denied.length / claims.length : 0,
      amountAtRisk: denied.reduce((s, c) => s + (c.outstanding_amount || c.claimed_amount), 0),
      avgRecoveryRate: avgRecovery,
      firstPassResolved: firstPass,
      firstPassRate: claims.length ? firstPass / claims.length : 0,
    });
  }
  return rows.sort((a, b) => b.denialRate - a.denialRate);
}

export function getCategoryStats(claims?: ClaimSource): CategoryStat[] {
  const rows = getDenialRows(claims);
  const map = new Map<DenialCategory, CategoryStat>();
  for (const r of rows) {
    const cur = map.get(r.code.category) || {
      category: r.code.category, count: 0, amountAtRisk: 0, avgRecoveryRate: 0,
    };
    cur.count += 1;
    cur.amountAtRisk += r.shortPaid;
    cur.avgRecoveryRate += r.code.recoveryRate;
    map.set(r.code.category, cur);
  }
  return Array.from(map.values())
    .map(s => ({ ...s, avgRecoveryRate: s.count ? s.avgRecoveryRate / s.count : 0 }))
    .sort((a, b) => b.amountAtRisk - a.amountAtRisk);
}

export function getCodeStats(claims?: ClaimSource): CodeStat[] {
  const rows = getDenialRows(claims);
  const map = new Map<string, CodeStat>();
  for (const r of rows) {
    const cur = map.get(r.code.code) || { code: r.code, count: 0, amountAtRisk: 0 };
    cur.count += 1;
    cur.amountAtRisk += r.shortPaid;
    map.set(r.code.code, cur);
  }
  // Pad with zero-count common codes for taxonomy completeness in UI
  for (const c of DENIAL_CODES) {
    if (!map.has(c.code)) map.set(c.code, { code: c, count: 0, amountAtRisk: 0 });
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || b.amountAtRisk - a.amountAtRisk);
}

export interface DenialKpis {
  totalDenied: number;
  totalClaims: number;
  denialRate: number;
  amountAtRisk: number;
  recoverable: number;
  firstPassRate: number;
  appealableShare: number;
}

export function getDenialKpis(claims?: ClaimSource): DenialKpis {
  const list = src(claims);
  const rows = getDenialRows(claims);
  const totalClaims = list.length;
  const amountAtRisk = rows.reduce((s, r) => s + r.shortPaid, 0);
  const recoverable = rows.reduce((s, r) => s + r.shortPaid * r.code.recoveryRate, 0);
  const firstPass = list.filter(isFirstPassResolved).length;
  const appealable = rows.filter(r => r.code.appealable).length;
  return {
    totalDenied: rows.length,
    totalClaims,
    denialRate: totalClaims ? rows.length / totalClaims : 0,
    amountAtRisk,
    recoverable,
    firstPassRate: totalClaims ? firstPass / totalClaims : 0,
    appealableShare: rows.length ? appealable / rows.length : 0,
  };
}
