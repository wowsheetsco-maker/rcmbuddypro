// Match a denied claim → cashless playbook entry using keyword scoring on
// claim_status + insurer_comments + diagnosis + treatment.
// Falls back to a sensible default when no specific match is found.

import { CASHLESS_PLAYBOOK, type PlaybookEntry } from "@/data/cashlessPlaybook";
import type { Claim } from "@/data/mockClaims";

// Per-entry keyword bag derived from the reason / clause / category text.
// Higher weighted keywords are added explicitly for the most common signals.
const KEYWORD_OVERRIDES: Record<number, string[]> = {
  1:  ["non-empanel", "out of network", "out-of-network", "not empanel"],
  2:  ["pre auth", "pre-auth", "preauth", "pre authorization", "authorization not", "no preauth"],
  3:  ["policy lapse", "premium lapse", "policy not active", "policy expired"],
  4:  ["room rent", "room category", "proportionate", "sub limit room", "sublimit room", "room sublimit"],
  5:  ["waiting period", "waiting-period"],
  6:  ["late filing", "late submission", "tat breach", "delay submission", "intimation delay"],
  7:  ["stent", "drug eluting", "drug-eluting", "des"],
  8:  ["cabg", "bypass surgery", "elective cardiac"],
  9:  ["pacemaker", "icd ", "implantable cardioverter"],
  10: ["knee implant", "hip implant", "joint replacement", "tkr", "thr", "implant cost"],
  11: ["alcohol", "intoxicat", "drunk", "self inflict", "self-inflict"],
  12: ["degenerat", "chronic", "osteoarthritis", "spondyl"],
  13: ["stroke", "cva", "cerebrovascular"],
  14: ["epilep", "seizure"],
  15: ["spine surger", "discect", "laminect", "spinal fusion"],
  16: ["oral chemo", "chemotherapy oral"],
  17: ["immunotherapy", "targeted therapy", "biologics", "monoclonal"],
  18: ["cancer waiting", "carcinoma waiting", "malignancy waiting"],
  19: ["maternity", "delivery", "normal delivery", "lscs", "c-section"],
  20: ["mtp", "abortion", "termination of pregnancy"],
  21: ["hysterectomy", "fibroid"],
  22: ["newborn", "neonate", "neonatal", "nicu"],
  23: ["congenital"],
  24: ["psychiatric", "mental health", "depression", "schizophren", "bipolar"],
  25: ["dialysis"],
  26: ["urolog", "kidney stone", "lithotripsy"],
  27: ["bariatric", "obesity surgery", "gastric bypass"],
  28: ["liver transplant", "transplant"],
  29: ["cataract", "phaco", "iol"],
  30: ["lasik", "refractive", "vision correction"],
  31: ["tonsil", "septoplasty", "fess", "sinus surgery"],
  32: ["cosmetic", "plastic surgery"],
  33: ["physiotherap", "rehab", "rehabilitat"],
  34: ["icu sublimit", "icu cap", "icu room"],
  35: ["consumable", "non-payable", "admin charge", "admission fee"],
};

const STOPWORDS = new Set<string>([
  "with", "from", "this", "that", "claim", "policy", "patient", "hospital",
  "clause", "exclusion", "coverage", "denial", "denied", "above", "below",
]);

interface MatchableEntry {
  entry: PlaybookEntry;
  bag: string[]; // lowercase keywords
}

const INDEX: MatchableEntry[] = CASHLESS_PLAYBOOK.map(entry => {
  const seed = `${entry.reason} ${entry.clause} ${entry.category} ${entry.dept}`.toLowerCase();
  const tokens = seed
    .replace(/[^\w\s/-]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 3 && !STOPWORDS.has(t));
  const overrides = KEYWORD_OVERRIDES[entry.sr] || [];
  return { entry, bag: [...new Set([...tokens, ...overrides.map(o => o.toLowerCase())])] };
});

export interface PlaybookMatch {
  entry: PlaybookEntry;
  score: number;
  matchedTerms: string[];
}

function isDeniedStatus(s: string): boolean {
  const x = (s || "").toLowerCase();
  return x.includes("deni") || x.includes("query") || x.includes("reject") || x.includes("short");
}

/** Find the best-matching playbook entry for a claim, or null if none reasonable. */
export function matchPlaybook(claim: Pick<Claim, "claim_status" | "insurer_comments" | "diagnosis" | "treatment">): PlaybookMatch | null {
  if (!isDeniedStatus(claim.claim_status)) return null;

  const blob = [
    claim.claim_status,
    claim.insurer_comments ?? "",
    claim.diagnosis ?? "",
    claim.treatment ?? "",
  ].join(" ").toLowerCase();

  let best: PlaybookMatch | null = null;
  for (const { entry, bag } of INDEX) {
    let score = 0;
    const matched: string[] = [];
    for (const term of bag) {
      if (blob.includes(term)) {
        // multi-word phrase = stronger signal
        score += term.includes(" ") || term.includes("-") ? 4 : 1;
        matched.push(term);
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score, matchedTerms: matched };
    }
  }

  // Fallback: pick a generic "All Departments" entry when nothing matched
  if (!best) {
    // Generic mappings by status keyword
    if (blob.includes("pre auth") || blob.includes("preauth")) {
      return { entry: CASHLESS_PLAYBOOK[1], score: 0, matchedTerms: [] };
    }
    if (blob.includes("document") || blob.includes("query")) {
      return { entry: CASHLESS_PLAYBOOK[5], score: 0, matchedTerms: [] };
    }
    if (blob.includes("room")) {
      return { entry: CASHLESS_PLAYBOOK[3], score: 0, matchedTerms: [] };
    }
    // Default: pre-auth not obtained (most common cashless denial)
    return { entry: CASHLESS_PLAYBOOK[1], score: 0, matchedTerms: [] };
  }
  return best;
}

/** Aggregate playbook matches across many claims, grouped by entry. */
export interface PlaybookAggregate {
  entry: PlaybookEntry;
  count: number;
  amountAtRisk: number;
}

export function aggregatePlaybook(
  claims: ReadonlyArray<Claim>,
): PlaybookAggregate[] {
  const map = new Map<number, PlaybookAggregate>();
  for (const c of claims) {
    const m = matchPlaybook(c);
    if (!m) continue;
    const cur = map.get(m.entry.sr) || { entry: m.entry, count: 0, amountAtRisk: 0 };
    cur.count += 1;
    const shortPaid = c.approved_amount > 0
      ? Math.max(c.claimed_amount - c.approved_amount, c.outstanding_amount)
      : c.claimed_amount;
    cur.amountAtRisk += shortPaid;
    map.set(m.entry.sr, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.amountAtRisk - a.amountAtRisk);
}
