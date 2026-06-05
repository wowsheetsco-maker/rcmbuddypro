/**
 * Write-off approval matrix.
 * Thresholds are amount-banded and reason-aware so small balances can be auto-cleared
 * by a manager while large bad-debt write-offs need owner/CFO approval.
 */
export type WriteoffReason =
  | "small_balance"
  | "bad_debt"
  | "contractual"
  | "timely_filing"
  | "duplicate"
  | "other";

export const WRITEOFF_REASONS: { value: WriteoffReason; label: string; hint: string }[] = [
  { value: "small_balance",  label: "Small balance",   hint: "Residual balance below cost-to-collect." },
  { value: "contractual",    label: "Contractual",     hint: "Tariff disallowance per TPA agreement." },
  { value: "timely_filing",  label: "Timely filing",   hint: "Submission window expired." },
  { value: "duplicate",      label: "Duplicate claim", hint: "Already settled under another claim." },
  { value: "bad_debt",       label: "Bad debt",        hint: "Uncollectible after collections attempts." },
  { value: "other",          label: "Other",           hint: "Specify in justification." },
];

export type ApproverRole = "team_lead" | "manager" | "admin" | "owner";

export const ROLE_LABEL: Record<ApproverRole, string> = {
  team_lead: "Team Lead",
  manager:   "Manager",
  admin:     "Admin / Finance Head",
  owner:     "Owner / CFO",
};

interface MatrixRule {
  /** Amount upper bound (inclusive) in INR; Infinity = no cap. */
  upTo: number;
  role: ApproverRole;
}

/** Default ladder. Bad debt is always one rung higher than contractual. */
const SMALL_BALANCE_LADDER: MatrixRule[] = [
  { upTo: 5_000,        role: "team_lead" },
  { upTo: 50_000,       role: "manager" },
  { upTo: Infinity,     role: "admin" },
];

const CONTRACTUAL_LADDER: MatrixRule[] = [
  { upTo: 10_000,       role: "team_lead" },
  { upTo: 100_000,      role: "manager" },
  { upTo: 500_000,      role: "admin" },
  { upTo: Infinity,     role: "owner" },
];

const BAD_DEBT_LADDER: MatrixRule[] = [
  { upTo: 25_000,       role: "manager" },
  { upTo: 200_000,      role: "admin" },
  { upTo: Infinity,     role: "owner" },
];

const DEFAULT_LADDER: MatrixRule[] = [
  { upTo: 10_000,       role: "team_lead" },
  { upTo: 100_000,      role: "manager" },
  { upTo: 1_000_000,    role: "admin" },
  { upTo: Infinity,     role: "owner" },
];

const LADDER_BY_REASON: Record<WriteoffReason, MatrixRule[]> = {
  small_balance: SMALL_BALANCE_LADDER,
  contractual:   CONTRACTUAL_LADDER,
  timely_filing: CONTRACTUAL_LADDER,
  duplicate:     CONTRACTUAL_LADDER,
  bad_debt:      BAD_DEBT_LADDER,
  other:         DEFAULT_LADDER,
};

export function requiredApprover(reason: WriteoffReason, amount: number): ApproverRole {
  const ladder = LADDER_BY_REASON[reason] ?? DEFAULT_LADDER;
  for (const rule of ladder) if (amount <= rule.upTo) return rule.role;
  return "owner";
}
