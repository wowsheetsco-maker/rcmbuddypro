import type { Claim } from "@/data/mockClaims";
import { DENIED_STATUSES, SETTLED_STATUSES } from "./payerScorecard";

/**
 * One row in the Corporate Performance table — represents a single employer /
 * group health policy holder aggregated across all their claims.
 *
 * Net Collection Rate (NCR) is the gold-standard payer KPI used by hospital
 * finance teams: settled / billed. We surface it alongside denial%, breach
 * count, and outstanding aging buckets so CFOs can spot the worst employer
 * accounts at a glance.
 */
export interface CorporateStats {
  name: string;
  /** Distinct TPAs that wrote claims for this corporate. */
  tpas: string[];
  /** Distinct insurers behind those TPAs. */
  insurers: string[];
  claims: number;
  uniqueMembers: number;
  billed: number;
  approved: number;
  settled: number;
  outstanding: number;
  /** Net Collection Rate %: settled ÷ billed. */
  ncrPct: number;
  /** Approval %: approved ÷ billed. */
  approvalPct: number;
  /** Denial %: denied claims ÷ total claims. */
  denialPct: number;
  /** SLA 30d breach count (open claims older than 30d). */
  irdaiBreach: number;
  /** Avg days from claim creation → today (open) or → payment (closed). */
  avgDays: number;
  /** Outstanding aging in 4 buckets (₹). */
  aging: { d0_30: number; d31_60: number; d61_90: number; d90_plus: number };
  /** Last activity timestamp across the bucket. */
  lastActivity: string | null;
  /** Composite risk profile derived from NCR / aging / denial. */
  risk: "critical" | "high" | "medium" | "low";
}

const UNKNOWN = "⚠ Individual / Retail (no employer)";

/** Map a claim's outstanding amount into one of the 4 aging buckets. */
function ageBucket(daysOld: number): keyof CorporateStats["aging"] {
  if (daysOld <= 30) return "d0_30";
  if (daysOld <= 60) return "d31_60";
  if (daysOld <= 90) return "d61_90";
  return "d90_plus";
}

function ageDays(claim: Claim): number {
  const ref = claim.payment_update_date || new Date().toISOString().slice(0, 10);
  const start = new Date(claim.claim_creation_date).getTime();
  const end = new Date(ref).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000);
}

/** Aggregate claims by `policy_holder_name`. */
export function buildCorporateStats(claims: Claim[]): CorporateStats[] {
  const map = new Map<
    string,
    Omit<CorporateStats, "ncrPct" | "approvalPct" | "denialPct" | "avgDays" | "risk" | "tpas" | "insurers"> & {
      tpas: Set<string>;
      insurers: Set<string>;
      patients: Set<string>;
      deniedCount: number;
      daysTotal: number;
      daysCount: number;
    }
  >();

  for (const c of claims) {
    const rawName = (c.policy_holder_name || "").trim() || UNKNOWN;
    let e = map.get(rawName);
    if (!e) {
      e = {
        name: rawName,
        tpas: new Set<string>(),
        insurers: new Set<string>(),
        patients: new Set<string>(),
        claims: 0,
        uniqueMembers: 0,
        billed: 0,
        approved: 0,
        settled: 0,
        outstanding: 0,
        irdaiBreach: 0,
        deniedCount: 0,
        daysTotal: 0,
        daysCount: 0,
        aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 },
        lastActivity: null,
      };
      map.set(rawName, e);
    }

    if (c.tpa_name) e.tpas.add(c.tpa_name);
    if (c.insurance_company_name) e.insurers.add(c.insurance_company_name);

    e.claims += 1;
    const memberKey = (c.member_customer_id || c.patient_name || c.id).toLowerCase();
    e.patients.add(memberKey);

    e.billed += c.claimed_amount || 0;
    e.approved += c.approved_amount || 0;
    e.settled += c.settled_amount || 0;
    e.outstanding += c.outstanding_amount || 0;

    if (c.is_irdai_breach) e.irdaiBreach += 1;

    const status = (c.claim_status || "").toLowerCase().trim();
    if (DENIED_STATUSES.has(status)) e.deniedCount += 1;

    // Aging buckets — only count open / outstanding claims
    if ((c.outstanding_amount || 0) > 0) {
      const days = ageDays(c);
      e.aging[ageBucket(days)] += c.outstanding_amount || 0;
      e.daysTotal += days;
      e.daysCount += 1;
    } else if (SETTLED_STATUSES.has(status) && c.payment_update_date && c.claim_creation_date) {
      const days = ageDays(c);
      e.daysTotal += days;
      e.daysCount += 1;
    }

    const activity =
      c.last_communication_at || c.payment_update_date || c.claim_creation_date || null;
    if (activity && (!e.lastActivity || activity > e.lastActivity)) {
      e.lastActivity = activity;
    }
  }

  return Array.from(map.values())
    .map((e): CorporateStats => {
      const ncrPct = e.billed ? +((e.settled / e.billed) * 100).toFixed(1) : 0;
      const approvalPct = e.billed ? +((e.approved / e.billed) * 100).toFixed(1) : 0;
      const denialPct = e.claims ? +((e.deniedCount / e.claims) * 100).toFixed(1) : 0;
      const avgDays = e.daysCount ? Math.round(e.daysTotal / e.daysCount) : 0;
      // Risk profile: weighted by NCR shortfall, 90+ aging, denial rate
      const oldShare = e.outstanding > 0 ? e.aging.d90_plus / e.outstanding : 0;
      let risk: CorporateStats["risk"] = "low";
      if (oldShare > 0.5 || ncrPct < 40 || denialPct > 30) risk = "critical";
      else if (oldShare > 0.25 || ncrPct < 60 || denialPct > 15) risk = "high";
      else if (oldShare > 0.1 || ncrPct < 75) risk = "medium";

      return {
        name: e.name,
        tpas: Array.from(e.tpas),
        insurers: Array.from(e.insurers),
        claims: e.claims,
        uniqueMembers: e.patients.size,
        billed: e.billed,
        approved: e.approved,
        settled: e.settled,
        outstanding: e.outstanding,
        ncrPct,
        approvalPct,
        denialPct,
        irdaiBreach: e.irdaiBreach,
        avgDays,
        aging: e.aging,
        lastActivity: e.lastActivity,
        risk,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);
}

export const RISK_TONE: Record<CorporateStats["risk"], string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/40",
  high: "bg-warning/15 text-warning border-warning/40",
  medium: "bg-accent/40 text-foreground border-border",
  low: "bg-success/15 text-success border-success/40",
};

export const RISK_DOT: Record<CorporateStats["risk"], string> = {
  critical: "bg-destructive",
  high: "bg-warning",
  medium: "bg-muted-foreground",
  low: "bg-success",
};

/** CSV export for the filtered corporate list. */
export function corporateRowsToCsv(rows: CorporateStats[]): string {
  const head = [
    "Corporate / Employer",
    "TPAs",
    "Insurers",
    "Claims",
    "Members",
    "Billed (₹)",
    "Approved (₹)",
    "Settled (₹)",
    "Outstanding (₹)",
    "NCR %",
    "Denial %",
    "Avg Days",
    "SLA Breach",
    "0-30d",
    "31-60d",
    "61-90d",
    "90+d",
    "Risk",
  ];
  const body = rows.map((r) =>
    [
      r.name,
      r.tpas.join(" | "),
      r.insurers.join(" | "),
      r.claims,
      r.uniqueMembers,
      Math.round(r.billed),
      Math.round(r.approved),
      Math.round(r.settled),
      Math.round(r.outstanding),
      r.ncrPct,
      r.denialPct,
      r.avgDays,
      r.irdaiBreach,
      Math.round(r.aging.d0_30),
      Math.round(r.aging.d31_60),
      Math.round(r.aging.d61_90),
      Math.round(r.aging.d90_plus),
      r.risk,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [head.join(","), ...body].join("\n");
}
