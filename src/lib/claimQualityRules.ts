// Hospital RCM quality-control rules applied at claim import time.
// Each rule classifies a claim into a bucket based on `claim_status` + age.
//
// Buckets:
//   remove       → drop from upload entirely
//   denied       → counts under "denied claims"
//   active       → counts under "active claims" (only if age < 15d)
//   active_stale → would-be active but older than 15d cutoff → drop
//   valid        → keep as-is (settled/processing/etc)
//   doc_pending  → keep, document submission pending
//   unknown      → unmapped status, keep with raw status

import type { ClaimUpsertRow } from "@/lib/claimsImport";

export type QualityBucket =
  | "remove"
  | "denied"
  | "active"
  | "active_stale"
  | "valid"
  | "doc_pending"
  | "unknown";

export interface QualityVerdict {
  bucket: QualityBucket;
  reason: string;
}

const ACTIVE_IF_FRESH = new Set([
  "pre auth initiated",
  "pre auth approved",
  "pre auth query replied",
  "discharge approved",
  "pre auth submitted to payer",
]);

const DENIED = new Set([
  "pre auth denied",
  "discharge denied",
  "claim denied",
  "reconsideration submitted",
  "enhancement denied",
]);

const VALID = new Set([
  "settled",
  "settlement initiated",
  "processing",
]);

const DOC_PENDING = new Set([
  "claim approved",
  "enhancement approved",
]);

const FRESH_DAYS = 15;
const PAQ_MAX_AGE = 30; // Pre Auth Query removed if older than 30d

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const t = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return 0;
  const today = new Date().setUTCHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - t) / 86_400_000));
}

export function classifyClaim(row: Pick<ClaimUpsertRow, "claim_status" | "claim_creation_date">): QualityVerdict {
  const status = (row.claim_status || "").trim().toLowerCase();
  const age = daysSince(row.claim_creation_date);

  if (status === "cancelled") return { bucket: "remove", reason: "Cancelled" };
  if (status === "pre auth query") {
    return age > PAQ_MAX_AGE
      ? { bucket: "remove", reason: `Pre Auth Query · ${age}d > 30d` }
      : { bucket: "active", reason: `Pre Auth Query · ${age}d` };
  }
  if (DENIED.has(status)) return { bucket: "denied", reason: status };
  if (ACTIVE_IF_FRESH.has(status)) {
    return age < FRESH_DAYS
      ? { bucket: "active", reason: `${status} · ${age}d` }
      : { bucket: "active_stale", reason: `${status} · ${age}d ≥ 15d` };
  }
  if (VALID.has(status)) return { bucket: "valid", reason: status };
  if (DOC_PENDING.has(status)) return { bucket: "doc_pending", reason: status };
  return { bucket: "unknown", reason: status || "(blank status)" };
}

export interface QualityClassification {
  verdicts: QualityVerdict[];
  counts: Record<QualityBucket, number>;
  /** Indices of rows that would be removed by QC. */
  removeIndices: number[];
}

export function classifyAll(rows: ClaimUpsertRow[]): QualityClassification {
  const verdicts = rows.map(classifyClaim);
  const counts: Record<QualityBucket, number> = {
    remove: 0, denied: 0, active: 0, active_stale: 0, valid: 0, doc_pending: 0, unknown: 0,
  };
  const removeIndices: number[] = [];
  verdicts.forEach((v, i) => {
    counts[v.bucket] += 1;
    if (v.bucket === "remove" || v.bucket === "active_stale") removeIndices.push(i);
  });
  return { verdicts, counts, removeIndices };
}

export const BUCKET_LABELS: Record<QualityBucket, string> = {
  remove: "Removed (Cancelled / PAQ > 30d)",
  denied: "Denied claims",
  active: "Active claims (< 15d)",
  active_stale: "Stale active (≥ 15d) — dropped",
  valid: "Valid (Settled / Processing)",
  doc_pending: "Doc pending",
  unknown: "Unmapped status",
};
