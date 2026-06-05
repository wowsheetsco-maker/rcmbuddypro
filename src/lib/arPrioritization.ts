/**
 * Worklist prioritization algorithm.
 *
 *   score = value_factor × age_factor × probability × payer_multiplier
 *
 * - value: log-scaled to avoid one mega-claim dominating the queue.
 * - age:   sweet-spot peak around 60–120d (older claims have lower recovery odds, newer ones not yet actionable).
 * - probability of recovery: heuristic from claim status + age + payer grade.
 * - payer behavior: from PayerScorecard grade (A+ → 1.2 ; D → 0.5).
 */
import type { Claim } from "@/data/mockClaims";
import type { Grade, PayerStats } from "@/lib/payerScorecard";

const SETTLED = new Set(["settled", "paid", "closed", "claim settled"]);
const DENIED  = new Set(["denied", "rejected", "claim denied", "discharge denied", "pre auth denied", "enhancement denied"]);

const GRADE_MULT: Record<Grade, number> = {
  "A+": 1.20,
  "A":  1.10,
  "B":  1.00,
  "C":  0.80,
  "D":  0.55,
};

function valueFactor(outstanding: number): number {
  // log scaling: 1k -> 3, 10k -> 4, 1L -> 5, 10L -> 6, 1Cr -> 7
  if (outstanding <= 0) return 0;
  return Math.log10(outstanding + 1);
}

function ageFactor(days: number): number {
  // Triangle peak between 45 and 120 days. Clamped to [0, 1].
  if (days < 15) return 0.3;
  if (days < 45) return 0.3 + ((days - 15) / 30) * 0.5; // ramp 0.3 → 0.8
  if (days <= 120) return 0.8 + ((Math.min(days, 90) - 45) / 45) * 0.2; // 0.8 → 1.0
  if (days <= 240) return 1.0 - ((days - 120) / 120) * 0.35; // 1.0 → 0.65
  return Math.max(0.35, 0.65 - ((days - 240) / 360) * 0.30);
}

function baseProbability(status: string, days: number): number {
  const s = (status ?? "").toLowerCase();
  if (DENIED.has(s)) return 0.20;
  if (s.includes("query") || s.includes("pending")) return 0.55;
  if (s.includes("approved") || s.includes("processed")) return 0.75;
  if (s.includes("submitted")) return 0.60;
  // Decay with extreme age
  if (days > 300) return 0.30;
  if (days > 180) return 0.45;
  return 0.55;
}

export interface PriorityScore {
  claim: Claim;
  score: number;            // composite 0..~10
  recoveryProb: number;     // 0..1
  payerMult: number;
  ageBucket: "0-30" | "31-60" | "61-90" | "91-180" | "180+";
  reasons: string[];
}

export function ageBucketOf(days: number): PriorityScore["ageBucket"] {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  if (days <= 180) return "91-180";
  return "180+";
}

export function buildWorklist(claims: Claim[], payerStats: PayerStats[]): PriorityScore[] {
  const gradeByName = new Map<string, Grade>();
  for (const p of payerStats) gradeByName.set(p.name.toLowerCase(), p.grade);

  const out: PriorityScore[] = [];
  for (const c of claims) {
    const status = (c.claim_status ?? "").toLowerCase();
    if (SETTLED.has(status)) continue;
    const outstanding = Number(c.outstanding_amount ?? 0);
    if (outstanding <= 0) continue;
    const days = c.days_since_claim ?? 0;

    const v = valueFactor(outstanding);
    const a = ageFactor(days);
    const p = baseProbability(status, days);
    const payerName = (c.tpa_name ?? c.insurance_company_name ?? "").toLowerCase();
    const grade = gradeByName.get(payerName);
    const mult = grade ? GRADE_MULT[grade] : 1.0;

    const score = v * a * p * mult;

    const reasons: string[] = [];
    if (outstanding >= 100_000) reasons.push(`High value ₹${Math.round(outstanding).toLocaleString("en-IN")}`);
    if (days >= 90) reasons.push(`Aged ${days}d`);
    if (grade && (grade === "C" || grade === "D")) reasons.push(`Weak payer grade ${grade}`);
    if (p >= 0.7) reasons.push("Likely recoverable");
    if (DENIED.has(status)) reasons.push("Denied — appeal candidate");

    out.push({
      claim: c,
      score: Math.round(score * 100) / 100,
      recoveryProb: Math.round(p * mult * 100) / 100,
      payerMult: mult,
      ageBucket: ageBucketOf(days),
      reasons,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}
