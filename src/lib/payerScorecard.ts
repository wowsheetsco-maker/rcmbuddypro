import type { Claim } from "@/data/mockClaims";

export const SETTLED_STATUSES = new Set([
  "settled",
  "paid",
  "closed",
  "claim settled",
]);

export const DENIED_STATUSES = new Set([
  "denied",
  "rejected",
  "claim denied",
  "pre auth denied",
  "discharge denied",
  "enhancement denied",
]);

export interface PayerStats {
  /** Display name (TPA or Insurer). */
  name: string;
  type: "TPA" | "Insurer";
  claims: number;
  uniquePatients: number;
  claimed: number;
  approved: number;
  settled: number;
  tds: number;
  outstanding: number;
  /** Discrepancy % vs approved: (approved − settled − tds) / approved. */
  discPct: number;
  /** Average TAT in days from creation → payment for *settled* claims only. */
  avgTat: number;
  /** Approval rate: approved / claimed. */
  approvalPct: number;
  /** Net realisation: settled / approved. */
  netRealPct: number;
  /** Denial rate. */
  denialPct: number;
  /** SLA breach count. */
  irdaiBreach: number;
  /** Composite grade A+ → D (see {@link gradeFor}). */
  grade: Grade;
  /** 0-100 score behind the grade. */
  score: number;
  /** Latest activity timestamp across the bucket. */
  lastActivity: string | null;
}

export type Grade = "A+" | "A" | "B" | "C" | "D";

/** Aggregate claims by TPA or Insurer. */
export function buildPayerStats(claims: Claim[], view: "tpa" | "insurer"): PayerStats[] {
  const map = new Map<
    string,
    {
      name: string;
      claims: number;
      patients: Set<string>;
      claimed: number;
      approved: number;
      settled: number;
      tds: number;
      outstanding: number;
      tatTotal: number;
      tatCount: number;
      settledCount: number;
      deniedCount: number;
      irdaiBreach: number;
      lastActivity: string | null;
    }
  >();

  for (const c of claims) {
    const rawName =
      view === "tpa"
        ? c.tpa_name || "Unknown"
        : c.insurance_company_name || c.tpa_name || "Unknown";
    const key = rawName.trim() || "Unknown";
    let e = map.get(key);
    if (!e) {
      e = {
        name: key,
        claims: 0,
        patients: new Set<string>(),
        claimed: 0,
        approved: 0,
        settled: 0,
        tds: 0,
        outstanding: 0,
        tatTotal: 0,
        tatCount: 0,
        settledCount: 0,
        deniedCount: 0,
        irdaiBreach: 0,
        lastActivity: null,
      };
      map.set(key, e);
    }
    e.claims += 1;
    const patientKey = (c.member_customer_id || c.patient_name || c.id).toLowerCase();
    e.patients.add(patientKey);
    e.claimed += c.claimed_amount || 0;
    e.approved += c.approved_amount || 0;
    e.settled += c.settled_amount || 0;
    e.tds += c.tds_amount || 0;
    e.outstanding += c.outstanding_amount || 0;
    if (c.is_irdai_breach) e.irdaiBreach += 1;

    const status = (c.claim_status || "").toLowerCase().trim();
    if (SETTLED_STATUSES.has(status)) e.settledCount += 1;
    if (DENIED_STATUSES.has(status)) e.deniedCount += 1;

    if (
      SETTLED_STATUSES.has(status) &&
      c.payment_update_date &&
      c.claim_creation_date
    ) {
      const start = new Date(c.claim_creation_date).getTime();
      const end = new Date(c.payment_update_date).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
        const days = Math.floor((end - start) / 86_400_000);
        if (days <= 365) {
          e.tatTotal += days;
          e.tatCount += 1;
        }
      }
    }

    const activity =
      c.last_communication_at || c.payment_update_date || c.claim_creation_date || null;
    if (activity && (!e.lastActivity || activity > e.lastActivity)) {
      e.lastActivity = activity;
    }
  }

  // Pre-pass: portfolio max volume for log-normalisation
  const maxClaims = Math.max(1, ...Array.from(map.values()).map((e) => e.claims));

  return Array.from(map.values())
    .map((e): PayerStats => {
      const discPct = e.approved
        ? +(((e.approved - e.settled - e.tds) / e.approved) * 100).toFixed(1)
        : 0;
      const avgTat = e.tatCount ? Math.round(e.tatTotal / e.tatCount) : 0;
      const approvalPct = e.claimed
        ? +((e.approved / e.claimed) * 100).toFixed(1)
        : 0;
      const netRealPct = e.approved
        ? +((e.settled / e.approved) * 100).toFixed(1)
        : 0;
      const denialPct = e.claims
        ? +((e.deniedCount / e.claims) * 100).toFixed(1)
        : 0;
      const score = scoreFor({
        netRealPct,
        approvalPct,
        avgTat,
        discPct,
        claims: e.claims,
        maxClaims,
      });
      return {
        name: e.name,
        type: view === "tpa" ? "TPA" : "Insurer",
        claims: e.claims,
        uniquePatients: e.patients.size,
        claimed: e.claimed,
        approved: e.approved,
        settled: e.settled,
        tds: e.tds,
        outstanding: e.outstanding,
        discPct,
        avgTat,
        approvalPct,
        netRealPct,
        denialPct,
        irdaiBreach: e.irdaiBreach,
        score,
        grade: gradeFor(score, e.claims),
        lastActivity: e.lastActivity,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);
}

/**
 * Composite payer score (0-100) — hospital-internal weighting.
 *
 * Volume comes first because a TPA with 700 claims is a much bigger lever for
 * the hospital than a one-off claim that happened to settle quickly.
 *
 *  • Volume 35%      — log-scaled vs the largest payer in the portfolio
 *  • Net realisation 25%
 *  • Approval rate   20%
 *  • TAT (≤30d)      12%
 *  • Discrepancy     8%   (penalised; over-payments treated as 0% disc)
 *
 * Use {@link gradeFor} to convert score → letter grade with a low-volume cap.
 */
export function scoreFor(p: {
  netRealPct: number;
  approvalPct: number;
  avgTat: number;
  discPct: number;
  claims: number;
  maxClaims: number;
}): number {
  // Log-scaled volume: ln(1+claims) / ln(1+max) * 100
  const volScore =
    p.maxClaims > 0
      ? (Math.log1p(p.claims) / Math.log1p(p.maxClaims)) * 100
      : 0;
  const tatScore =
    p.avgTat <= 0 ? 0 : Math.max(0, 100 - (p.avgTat / 30) * 50);
  const discPenalty = Math.max(0, p.discPct);
  const discScore = Math.max(0, 100 - discPenalty * 2);
  const composite =
    volScore * 0.35 +
    p.netRealPct * 0.25 +
    p.approvalPct * 0.2 +
    tatScore * 0.12 +
    discScore * 0.08;
  return Math.round(composite);
}

/**
 * Convert score → letter grade with a low-volume confidence cap so a payer
 * with only 1–2 claims cannot outrank a high-volume payer.
 *
 *  • <3 claims  → max C (insufficient sample)
 *  • <10 claims → max B
 */
export function gradeFor(score: number, claims = Infinity): Grade {
  let grade: Grade;
  if (score >= 80) grade = "A+";
  else if (score >= 68) grade = "A";
  else if (score >= 55) grade = "B";
  else if (score >= 40) grade = "C";
  else grade = "D";

  if (claims < 3 && (grade === "A+" || grade === "A" || grade === "B")) return "C";
  if (claims < 10 && (grade === "A+" || grade === "A")) return "B";
  return grade;
}

export const GRADE_TONE: Record<Grade, string> = {
  "A+": "bg-success/15 text-success border-success/40",
  A: "bg-success/15 text-success border-success/40",
  B: "bg-accent/40 text-foreground border-border",
  C: "bg-warning/15 text-warning border-warning/40",
  D: "bg-destructive/15 text-destructive border-destructive/40",
};

/** A single negotiation talking point for the TPA report. */
export interface TalkingPoint {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

/**
 * Build data-driven talking points for a single payer. Only points that are
 * actually true for the payer are emitted — no template padding.
 */
export function buildTalkingPoints(p: PayerStats): TalkingPoint[] {
  const out: TalkingPoint[] = [];

  // 1. Net realisation
  if (p.netRealPct > 0 && p.netRealPct < 80) {
    out.push({
      id: "net-real",
      title: `Net Collection Rate is ${p.netRealPct}% — demand minimum 80%`,
      detail: `On ${p.claims} claims and ₹${(p.claimed / 100000).toFixed(1)} L billed, we expect 80%+ NR.`,
      severity: p.netRealPct < 60 ? "high" : "medium",
    });
  }

  // 2. TAT vs SLA 30d
  if (p.avgTat > 30) {
    out.push({
      id: "tat",
      title: `Avg settlement ${p.avgTat} days — SLA mandates 30`,
      detail: `${p.irdaiBreach} claims breach the SLA 30-day window.`,
      severity: p.avgTat > 60 ? "high" : "medium",
    });
  } else if (p.avgTat === 0 && p.claims > 5) {
    out.push({
      id: "tat-missing",
      title: "Settlement TAT not being captured",
      detail: "Payment update dates are missing for most claims — request UTR/payment confirmation.",
      severity: "medium",
    });
  }

  // 3. Underpayment / discrepancy
  if (p.discPct > 5) {
    out.push({
      id: "disc",
      title: `Underpayment rate ${p.discPct}% — demand resolution SLA`,
      detail: `₹${Math.round(p.approved - p.settled - p.tds).toLocaleString("en-IN")} unresolved across approved-but-short-paid claims. Demand 7-day resolution SLA.`,
      severity: p.discPct > 15 ? "high" : "medium",
    });
  }

  // 4. Denial rate
  if (p.denialPct > 15) {
    out.push({
      id: "denial",
      title: `Denial rate ${p.denialPct}% — demand written reasons`,
      detail: "Formal written denial reasons within 15 days as per SLA mandate.",
      severity: p.denialPct > 30 ? "high" : "medium",
    });
  }

  // 5. Approval rate
  if (p.approvalPct > 0 && p.approvalPct < 70) {
    out.push({
      id: "approval",
      title: `Approval rate ${p.approvalPct}% — request package re-mapping`,
      detail: "Low approval suggests package mismatches. Schedule a tariff alignment review.",
      severity: p.approvalPct < 55 ? "high" : "medium",
    });
  }

  // 6. Outstanding stockpile
  if (p.outstanding > 1_000_000) {
    out.push({
      id: "outstanding",
      title: `₹${(p.outstanding / 100000).toFixed(1)} L outstanding — escalate`,
      detail: `${p.claims} claims pending. Request a weekly reconciliation cadence.`,
      severity: p.outstanding > 5_000_000 ? "high" : "medium",
    });
  }

  // 7. Unique patients flat-rate angle
  if (p.uniquePatients >= 25) {
    out.push({
      id: "unique-patients",
      title: `${p.uniquePatients} unique patients — negotiate flat rates`,
      detail: "Chronic / repeat patients benefit both parties with flat monthly packages.",
      severity: "low",
    });
  }

  // 8. Stale activity
  if (p.lastActivity) {
    const days = Math.floor((Date.now() - new Date(p.lastActivity).getTime()) / 86_400_000);
    if (days > 14 && p.outstanding > 0) {
      out.push({
        id: "stale",
        title: `No activity for ${days} days`,
        detail: "Re-establish weekly reconciliation calls; assign a named relationship manager.",
        severity: days > 30 ? "high" : "low",
      });
    }
  }

  return out;
}
