/**
 * Heuristic classifier for payer/TPA names → category.
 * Used by the Payers hub when the database has no explicit payer_type column.
 *
 * Categories: government | psu | tpa | insurer | aggregator
 */
export type PayerCategory = "government" | "psu" | "tpa" | "insurer" | "aggregator";

export const PAYER_CATEGORY_LABELS: Record<PayerCategory | "all", string> = {
  all: "All payers",
  government: "Government",
  psu: "PSU",
  tpa: "TPA",
  insurer: "Insurer",
  aggregator: "Aggregator",
};

// Order matters — first match wins.
const RULES: { cat: PayerCategory; patterns: RegExp[] }[] = [
  {
    cat: "government",
    patterns: [
      /\bcghs\b/i, /\bechs\b/i, /\besic?\b/i, /\babha\b/i,
      /\bpmjay\b/i, /ayushman/i, /\bjsy\b/i, /\brsby\b/i,
      /chief minister/i, /\bcm\b.*scheme/i, /\bgovt\b/i, /government/i,
      /\brailway/i, /\brailways/i, /defen[cs]e/i, /\barmy\b/i, /\bnavy\b/i, /air ?force/i,
      /\bstate\b.*(scheme|health)/i, /municipal/i, /\bmcd\b/i, /\bbmc\b/i,
      /aarogyasri/i, /mahatma jyotiba/i, /biju/i, /mukhyamantri/i,
    ],
  },
  {
    cat: "psu",
    patterns: [
      /\bbsnl\b/i, /\bbhel\b/i, /\bongc\b/i, /\bntpc\b/i, /\bsail\b/i,
      /\bgail\b/i, /\biocl?\b/i, /indian oil/i, /hpcl/i, /bpcl/i,
      /coal india/i, /\bcil\b/i, /\bnpcil\b/i, /\bpgcil\b/i,
      /\bdrdo\b/i, /\bisro\b/i, /\bbel\b/i, /\bhal\b/i,
      /reserve bank/i, /\brbi\b/i, /state bank/i, /\bsbi\b/i,
      /\blic\b/i,
    ],
  },
  {
    cat: "aggregator",
    patterns: [
      /policy ?bazaar/i, /coverfox/i, /acko/i, /\bdigit\b/i,
      /plum\b/i, /onsurity/i, /loop/i, /\bnova\b.*benefit/i,
      /pazcare/i, /\bvitraya\b/i, /\bihx\b/i, /\bcare ?stack\b/i,
      /aggregator/i,
    ],
  },
  {
    cat: "tpa",
    patterns: [
      /\btpa\b/i, /mediassist/i, /medi ?assist/i, /paramount/i,
      /health india/i, /vidal/i, /family health plan/i, /\bfhpl\b/i,
      /\bmdindia\b/i, /\bericson\b/i, /\beast ?west\b/i, /good ?health/i,
      /raksha/i, /heritage health/i, /vipul/i, /alankit/i, /park ?mediclaim/i,
      /\bgenins\b/i, /\bsafeway\b/i, /\bspuran\b/i, /\bdedicated\b/i,
    ],
  },
  {
    cat: "insurer",
    patterns: [
      /insurance/i, /assurance/i, /\bgic\b/i,
      /\bnew india\b/i, /\boriental\b/i, /\bunited india\b/i, /\bnational insurance\b/i,
      /\bstar health\b/i, /\bniva\b/i, /max bupa/i, /\bbupa\b/i,
      /apollo munich/i, /aditya birla/i, /\bhdfc\b/i, /\bicici\b/i, /\bsbi\b/i,
      /\btata aig\b/i, /\bbajaj allianz\b/i, /\bcholamandalam\b/i, /\briligare\b/i,
      /\bmanipal cigna\b/i, /\bkotak\b/i, /\briligare\b/i, /\bfuture generali\b/i,
      /\briligare\b/i, /\bedelweiss\b/i, /\bgo digit\b/i, /\briligare\b/i,
    ],
  },
];

export function classifyPayer(name: string | null | undefined): PayerCategory {
  const n = (name ?? "").trim();
  if (!n) return "insurer";
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(n))) return rule.cat;
  }
  // Default: most non-TPA, non-govt payers are insurers
  return "insurer";
}
