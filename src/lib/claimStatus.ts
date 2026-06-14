/**
 * Canonical claim status state machine.
 *
 * The database now stores both the original free-text `claim_status` and a
 * normalised `claim_status_code` (enum) plus a coarser `claim_status_bucket`.
 * Reports and KPIs should group by `claim_status_bucket` / `claim_status_code`
 * so spelling variations no longer fragment totals.
 *
 * For UI labels keep using `STATUS_LABEL[code]`. For backwards-compat with
 * existing free-text filters call `normalizeStatusText(raw)`.
 */

export type ClaimStatusCode =
  | "pre_auth_submitted"
  | "pre_auth_query"
  | "pre_auth_query_replied"
  | "pre_auth_approved"
  | "pre_auth_denied"
  | "discharge_initiated"
  | "discharge_query"
  | "discharge_query_replied"
  | "discharge_approved"
  | "discharge_denied"
  | "enhancement_submitted"
  | "enhancement_query"
  | "enhancement_query_replied"
  | "enhancement_approved"
  | "enhancement_denied"
  | "claim_submitted"
  | "claim_query"
  | "claim_query_replied"
  | "claim_approved"
  | "claim_denied"
  | "reconsideration_submitted"
  | "settlement_initiated"
  | "settlement_reminder"
  | "settled"
  | "rejected"
  | "closed";

export type ClaimStatusBucket =
  | "pre_auth"
  | "in_progress"
  | "query"
  | "approved"
  | "denied"
  | "settled"
  | "closed";

export const STATUS_LABEL: Record<ClaimStatusCode, string> = {
  pre_auth_submitted: "Pre-Auth Submitted",
  pre_auth_query: "Pre-Auth Query",
  pre_auth_query_replied: "Pre-Auth Query Replied",
  pre_auth_approved: "Pre-Auth Approved",
  pre_auth_denied: "Pre-Auth Denied",
  discharge_initiated: "Discharge Initiated",
  discharge_query: "Discharge Query",
  discharge_query_replied: "Discharge Query Replied",
  discharge_approved: "Discharge Approved",
  discharge_denied: "Discharge Denied",
  enhancement_submitted: "Enhancement Submitted",
  enhancement_query: "Enhancement Query",
  enhancement_query_replied: "Enhancement Query Replied",
  enhancement_approved: "Enhancement Approved",
  enhancement_denied: "Enhancement Denied",
  claim_submitted: "Claim Submitted",
  claim_query: "Claim Query",
  claim_query_replied: "Claim Query Replied",
  claim_approved: "Claim Approved",
  claim_denied: "Claim Denied",
  reconsideration_submitted: "Reconsideration Submitted",
  settlement_initiated: "Settlement Initiated",
  settlement_reminder: "Settlement Reminder",
  settled: "Settled",
  rejected: "Rejected",
  closed: "Closed",
};

export const BUCKET_LABEL: Record<ClaimStatusBucket, string> = {
  pre_auth: "Pre-Auth",
  in_progress: "In Progress",
  query: "Query",
  approved: "Approved",
  denied: "Denied",
  settled: "Settled",
  closed: "Closed",
};

const CODE_TO_BUCKET: Record<ClaimStatusCode, ClaimStatusBucket> = {
  pre_auth_submitted: "pre_auth",
  pre_auth_query: "query",
  pre_auth_query_replied: "in_progress",
  pre_auth_approved: "approved",
  pre_auth_denied: "denied",
  discharge_initiated: "in_progress",
  discharge_query: "query",
  discharge_query_replied: "in_progress",
  discharge_approved: "approved",
  discharge_denied: "denied",
  enhancement_submitted: "in_progress",
  enhancement_query: "query",
  enhancement_query_replied: "in_progress",
  enhancement_approved: "approved",
  enhancement_denied: "denied",
  claim_submitted: "in_progress",
  claim_query: "query",
  claim_query_replied: "in_progress",
  claim_approved: "approved",
  claim_denied: "denied",
  reconsideration_submitted: "in_progress",
  settlement_initiated: "approved",
  settlement_reminder: "approved",
  settled: "settled",
  rejected: "denied",
  closed: "closed",
};

export const TERMINAL_CODES = new Set<ClaimStatusCode>([
  "settled",
  "rejected",
  "closed",
]);

export function bucketFor(code: ClaimStatusCode | null | undefined): ClaimStatusBucket | null {
  if (!code) return null;
  return CODE_TO_BUCKET[code] ?? null;
}

/** Map any legacy free-text claim_status into our canonical code, or null. */
export function normalizeStatusText(raw: string | null | undefined): ClaimStatusCode | null {
  const k = (raw ?? "").trim().toLowerCase();
  if (!k) return null;
  switch (k) {
    case "settled":
    case "claim settled":
    case "paid":
      return "settled";
    case "settlement initiated":
      return "settlement_initiated";
    case "settlementreminder":
    case "settlement reminder":
      return "settlement_reminder";
    case "pre auth submitted to payer":
    case "pre auth submitted":
      return "pre_auth_submitted";
    case "pre auth query":
      return "pre_auth_query";
    case "pre auth query replied":
      return "pre_auth_query_replied";
    case "pre auth approved":
      return "pre_auth_approved";
    case "pre auth denied":
      return "pre_auth_denied";
    case "discharge initiated":
      return "discharge_initiated";
    case "discharge query":
      return "discharge_query";
    case "discharge query replied":
      return "discharge_query_replied";
    case "discharge approved":
      return "discharge_approved";
    case "discharge denied":
      return "discharge_denied";
    case "enhancement submitted":
      return "enhancement_submitted";
    case "enhancement query":
      return "enhancement_query";
    case "enhancement query replied":
      return "enhancement_query_replied";
    case "enhancement approved":
      return "enhancement_approved";
    case "enhancement denied":
      return "enhancement_denied";
    case "claim submitted":
    case "claim in progress":
    case "processing":
      return "claim_submitted";
    case "claim query":
      return "claim_query";
    case "claim query replied":
      return "claim_query_replied";
    case "claim approved":
      return "claim_approved";
    case "claim denied":
      return "claim_denied";
    case "reconsideration submitted":
      return "reconsideration_submitted";
    case "rejected":
      return "rejected";
    case "cancelled":
    case "closed":
      return "closed";
    default:
      return null;
  }
}

/** All canonical codes ordered for dropdowns. */
export const STATUS_CODES_ORDERED: ClaimStatusCode[] = [
  "pre_auth_submitted",
  "pre_auth_query",
  "pre_auth_query_replied",
  "pre_auth_approved",
  "pre_auth_denied",
  "discharge_initiated",
  "discharge_query",
  "discharge_query_replied",
  "discharge_approved",
  "discharge_denied",
  "enhancement_submitted",
  "enhancement_query",
  "enhancement_query_replied",
  "enhancement_approved",
  "enhancement_denied",
  "claim_submitted",
  "claim_query",
  "claim_query_replied",
  "claim_approved",
  "claim_denied",
  "reconsideration_submitted",
  "settlement_initiated",
  "settlement_reminder",
  "settled",
  "rejected",
  "closed",
];
