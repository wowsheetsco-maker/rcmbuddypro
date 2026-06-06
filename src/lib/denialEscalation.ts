/**
 * Escalation matrix for denied claims.
 * Tier is decided by (age in days × short-paid amount × denial category).
 *
 *   Tier 1 (Executive)    — owner: Billing Executive
 *   Tier 2 (TL)           — owner: Billing TL
 *   Tier 3 (Manager)      — owner: Insurance Manager
 *   Tier 4 (CXO)          — owner: Hospital CXO (CEO/COO/CFO)
 *
 * SLAs are days-in-tier before auto-promotion to the next tier.
 */
import type { Claim } from "@/data/mockClaims";
import { mapToDenialCode } from "@/data/denialCodes";
import { getActionForCode } from "@/data/denialActions";

export type EscalationTier = 1 | 2 | 3 | 4;

export interface EscalationRow {
  claim: Claim;
  shortPaid: number;
  age: number;
  tier: EscalationTier;
  owner: string;
  sla_days: number;
  /** Days that the claim has already spent in its current tier (best-effort). */
  days_in_tier: number;
  /** True if days_in_tier ≥ sla_days — should be escalated up immediately. */
  should_promote: boolean;
  reason: string;
}

const TIER_OWNERS: Record<EscalationTier, string> = {
  1: "Billing Executive",
  2: "Billing TL",
  3: "Insurance Manager",
  4: "Hospital CXO",
};

const TIER_SLA_DAYS: Record<EscalationTier, number> = {
  1: 7,
  2: 7,
  3: 14,
  4: 30,
};

const HIGH_VALUE_INR = 100_000; // ₹1L
const VERY_HIGH_VALUE_INR = 500_000; // ₹5L
const CRITICAL_VALUE_INR = 2_000_000; // ₹20L

function pickTier(age: number, shortPaid: number, category: string | null): EscalationTier {
  // Critical value or critical age → CXO
  if (shortPaid >= CRITICAL_VALUE_INR || age >= 90) return 4;
  // High value or aged → Manager
  if (shortPaid >= VERY_HIGH_VALUE_INR || age >= 45) return 3;
  // Medium value or older than a week → TL
  if (shortPaid >= HIGH_VALUE_INR || age >= 14) return 2;
  // Default → executive
  // But: medical-necessity / PED escalates one tier earlier (needs clinical authority).
  if (category === "Medical Necessity" || category === "Pre-existing / Non-disclosure") {
    return age >= 7 ? 2 : 1;
  }
  return 1;
}

export function buildEscalationRow(claim: Claim, shortPaid: number): EscalationRow {
  const age = claim.days_since_claim ?? 0;
  const code = mapToDenialCode(claim.claim_status, claim.insurer_comments);
  const tier = pickTier(age, shortPaid, code?.category ?? null);
  const sla_days = TIER_SLA_DAYS[tier];
  // Best-effort "days in tier": time since last communication, else age.
  let days_in_tier = age;
  if (claim.last_communication_at) {
    const t = Date.parse(claim.last_communication_at);
    if (!Number.isNaN(t)) {
      days_in_tier = Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
    }
  }
  const action = getActionForCode(code);
  return {
    claim,
    shortPaid,
    age,
    tier,
    owner: action?.escalation_to ?? TIER_OWNERS[tier],
    sla_days,
    days_in_tier,
    should_promote: days_in_tier >= sla_days && tier < 4,
    reason: code?.description ?? claim.claim_status,
  };
}

export interface TierBucket {
  tier: EscalationTier;
  owner: string;
  count: number;
  amount: number;
  promote_count: number;
  rows: EscalationRow[];
}

export function bucketByTier(rows: EscalationRow[]): TierBucket[] {
  const out: TierBucket[] = ([1, 2, 3, 4] as EscalationTier[]).map((t) => ({
    tier: t,
    owner: TIER_OWNERS[t],
    count: 0,
    amount: 0,
    promote_count: 0,
    rows: [],
  }));
  for (const r of rows) {
    const b = out[r.tier - 1];
    b.count += 1;
    b.amount += r.shortPaid;
    if (r.should_promote) b.promote_count += 1;
    b.rows.push(r);
  }
  return out;
}

export { TIER_OWNERS, TIER_SLA_DAYS };
