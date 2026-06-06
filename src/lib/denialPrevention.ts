/**
 * Denial-prevention loop: turn observed denial patterns into actionable
 * scrubber rule suggestions that can be enabled in Settings → Data Quality.
 *
 * Inputs : your live claims (we use the same denial taxonomy as analytics).
 * Output : a ranked list of {rule_key, title, denial_count, amount_prevented,
 *          confidence, sample_claims}. The UI lets the user enable the rule;
 *          enabling persists into the dq_rules table's config jsonb.
 */
import type { Claim } from "@/data/mockClaims";
import { mapToDenialCode } from "@/data/denialCodes";
import { DENIAL_ACTIONS } from "@/data/denialActions";
import { getDenialRows } from "./denialAnalytics";

export interface PreventionSuggestion {
  rule_key: string;
  title: string;
  description: string;
  /** how many denials this rule would have prevented in the window */
  denial_count: number;
  /** ₹ amount that would have been saved */
  amount_prevented: number;
  /** 0-1 — denial_count / total denials in dataset */
  confidence: number;
  /** Top 5 claim numbers as proof points */
  sample_claims: string[];
}

const RULE_TITLES: Record<string, { title: string; description: string }> = {
  require_clinical_justification_on_preauth: {
    title: "Require clinical justification on every pre-auth",
    description:
      "Block pre-auth submission unless ICD-10 + procedure + 2-line clinical justification are filled. Stops most 'medical necessity' denials.",
  },
  check_daycare_procedure_list: {
    title: "Flag IPD admission for day-care procedures",
    description: "Warn billing if procedure appears in IRDAI day-care list before posting as IPD.",
  },
  waiting_period_check_at_preauth: {
    title: "Auto-check waiting period at pre-auth",
    description: "Compare policy inception date vs admission date and flag if inside waiting window.",
  },
  block_submission_without_discharge_summary: {
    title: "Block claim submission without discharge summary",
    description: "Submission Tracker refuses to mark submitted until DS doc is uploaded.",
  },
  require_investigation_bundle: {
    title: "Require investigation bundle on submission",
    description: "Auto-attach lab + imaging reports from HIS at claim submission.",
  },
  require_indoor_case_papers: {
    title: "Require ICP scan at file closure",
    description: "File-closure step prompts for indoor case papers; blocks submission if missing.",
  },
  kyc_match_on_registration: {
    title: "KYC match check at registration",
    description: "Compare patient name + DOB on Aadhaar with policy and warn on mismatch.",
  },
  room_eligibility_check_at_admission: {
    title: "Room eligibility check at admission",
    description: "Warn if room category exceeds policy entitlement; counsel patient for upgrade consent.",
  },
  apply_ppn_tariff: {
    title: "Apply PPN tariff automatically",
    description: "If patient is on PPN network, billing applies network tariff by default.",
  },
  ped_waiting_check: {
    title: "PED waiting-period check at pre-auth",
    description: "For chronic conditions, verify PED waiting period (typically 2-4 yrs) is completed.",
  },
  preauth_filed_before_admission_or_24h: {
    title: "Pre-auth SLA — before admission / within 24h",
    description: "Track and alert pre-auth desk if planned admissions lack pre-auth, or emergency cases pass 24h.",
  },
  submit_within_7_days_of_discharge: {
    title: "Submit final claim within 7 days of discharge",
    description: "Submission Tracker due-date enforced; auto-task created on discharge day-0.",
  },
};

export function generatePreventionSuggestions(claims: readonly Claim[]): PreventionSuggestion[] {
  const rows = getDenialRows(claims);
  const totalDenials = Math.max(1, rows.length);
  const map = new Map<string, { count: number; amount: number; samples: string[] }>();

  for (const r of rows) {
    const action = DENIAL_ACTIONS[r.code.code];
    if (!action?.scrubber_rule) continue;
    const cur = map.get(action.scrubber_rule) ?? { count: 0, amount: 0, samples: [] };
    cur.count += 1;
    cur.amount += r.shortPaid;
    if (cur.samples.length < 5 && r.claim.claim_number) {
      cur.samples.push(r.claim.claim_number);
    }
    map.set(action.scrubber_rule, cur);
  }

  const out: PreventionSuggestion[] = [];
  for (const [key, v] of map) {
    const meta = RULE_TITLES[key] ?? { title: key, description: "Custom rule" };
    out.push({
      rule_key: key,
      title: meta.title,
      description: meta.description,
      denial_count: v.count,
      amount_prevented: v.amount,
      confidence: v.count / totalDenials,
      sample_claims: v.samples,
    });
  }
  out.sort((a, b) => b.amount_prevented - a.amount_prevented);
  return out;
}

/** First-pass resolution rate over a rolling window (by claim_creation_date). */
export interface FprrPoint {
  bucket: string; // YYYY-MM
  total: number;
  first_pass: number;
  rate: number; // 0-1
}

export function firstPassByMonth(claims: readonly Claim[], months = 6): FprrPoint[] {
  const buckets = new Map<string, { total: number; fp: number }>();
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, { total: 0, fp: 0 });
  }
  for (const c of claims) {
    if (!c.claim_creation_date) continue;
    const t = Date.parse(c.claim_creation_date);
    if (Number.isNaN(t)) continue;
    const d = new Date(t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const b = buckets.get(key);
    if (!b) continue;
    b.total += 1;
    const code = mapToDenialCode(c.claim_status, c.insurer_comments);
    const s = c.claim_status.toLowerCase();
    if (!code && (s.includes("settled") || s.includes("approved") || s.includes("settlement"))) {
      b.fp += 1;
    }
  }
  return Array.from(buckets.entries()).map(([bucket, v]) => ({
    bucket,
    total: v.total,
    first_pass: v.fp,
    rate: v.total ? v.fp / v.total : 0,
  }));
}
