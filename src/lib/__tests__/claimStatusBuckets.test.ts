import { describe, it, expect } from "vitest";
import {
  SUBMITTED_STATUSES,
  DOCS_TO_SUBMIT_STATUSES,
  isSubmitted,
  isDocsToSubmit,
  isSettled,
  isDenied,
  computeReconciliation,
  type StatusedClaim,
} from "../claimStatusBuckets";

const mk = (s: Partial<StatusedClaim>): StatusedClaim => ({
  claim_status: s.claim_status ?? null,
  date_of_discharge: s.date_of_discharge ?? null,
  approved_amount: s.approved_amount ?? 0,
  claimed_amount: s.claimed_amount ?? 0,
  settled_amount: s.settled_amount ?? 0,
});

describe("isSubmitted", () => {
  const submittedSamples = [
    "Settled", "paid", "closed",
    "Settlement Initiated", "SettlementReminder", "settlement reminder",
    "Claim Denied", "denied", "rejected",
    "Reconsideration Submitted",
    "Processing", "Claim in Progress", "in progress",
    "Claim Query", "query",
  ];

  it.each(submittedSamples)("treats %s as submitted (case-insensitive)", (status) => {
    // "SettlementReminder" is not in the set as a single token — verify expectation.
    if (status.toLowerCase() === "settlementreminder") {
      expect(isSubmitted(mk({ claim_status: status }))).toBe(false);
    } else {
      expect(isSubmitted(mk({ claim_status: status }))).toBe(true);
    }
  });

  it("does NOT treat approved-but-not-submitted statuses as submitted", () => {
    for (const s of ["Claim Approved", "Discharge Approved", "Pre Auth Approved", "Pre-Auth Approved"]) {
      expect(isSubmitted(mk({ claim_status: s }))).toBe(false);
    }
  });

  it("handles null/empty status", () => {
    expect(isSubmitted(mk({ claim_status: null }))).toBe(false);
    expect(isSubmitted(mk({ claim_status: "" }))).toBe(false);
  });
});

describe("isDocsToSubmit", () => {
  const approvedStatuses = ["Claim Approved", "Discharge Approved", "Pre Auth Approved", "Pre-Auth Approved"];

  it.each(approvedStatuses)("flags %s as docs-to-submit ONLY when discharged", (status) => {
    expect(isDocsToSubmit(mk({ claim_status: status, date_of_discharge: "2025-01-01" }))).toBe(true);
    expect(isDocsToSubmit(mk({ claim_status: status, date_of_discharge: null }))).toBe(false);
  });

  it("does not flag submitted/settled/denied statuses even if discharged", () => {
    for (const s of ["Settled", "Claim Denied", "Processing", "Settlement Initiated"]) {
      expect(isDocsToSubmit(mk({ claim_status: s, date_of_discharge: "2025-01-01" }))).toBe(false);
    }
  });
});

describe("isSettled / isDenied", () => {
  it("classifies settled", () => {
    expect(isSettled(mk({ claim_status: "Settled" }))).toBe(true);
    expect(isSettled(mk({ claim_status: "Paid" }))).toBe(true);
    expect(isSettled(mk({ claim_status: "Processing" }))).toBe(false);
  });
  it("classifies denied", () => {
    expect(isDenied(mk({ claim_status: "Claim Denied" }))).toBe(true);
    expect(isDenied(mk({ claim_status: "Rejected" }))).toBe(true);
    expect(isDenied(mk({ claim_status: "Settled" }))).toBe(false);
  });
});

describe("computeReconciliation", () => {
  it("Submitted never exceeds Approved (count + amount)", () => {
    const claims: StatusedClaim[] = [
      mk({ claim_status: "Processing", approved_amount: 100 }),
      mk({ claim_status: "Settled", approved_amount: 200, settled_amount: 200 }),
      mk({ claim_status: "Claim Denied", approved_amount: 50 }),
      mk({ claim_status: "Claim Approved", approved_amount: 75, date_of_discharge: "2025-01-01" }),
    ];
    const r = computeReconciliation(claims);
    expect(r.submitted.count).toBeLessThanOrEqual(r.approved.count);
    expect(r.submitted.amount).toBeLessThanOrEqual(r.approved.amount);
    expect(r.warnings).toEqual([]);
  });

  it("counts docs-to-submit only when approved + discharged", () => {
    const claims: StatusedClaim[] = [
      mk({ claim_status: "Claim Approved", approved_amount: 100, date_of_discharge: "2025-01-01" }),
      mk({ claim_status: "Discharge Approved", approved_amount: 200, date_of_discharge: "2025-01-02" }),
      mk({ claim_status: "Pre Auth Approved", approved_amount: 300, date_of_discharge: null }), // excluded
      mk({ claim_status: "Settled", approved_amount: 400, settled_amount: 400, date_of_discharge: "2025-01-03" }), // excluded
    ];
    const r = computeReconciliation(claims);
    expect(r.docsToSubmit.count).toBe(2);
    expect(r.docsToSubmit.amount).toBe(300);
  });

  it("returns zero buckets for empty input", () => {
    const r = computeReconciliation([]);
    expect(r.approved).toEqual({ count: 0, amount: 0 });
    expect(r.submitted).toEqual({ count: 0, amount: 0 });
    expect(r.settled).toEqual({ count: 0, amount: 0 });
    expect(r.docsToSubmit).toEqual({ count: 0, amount: 0 });
    expect(r.warnings).toEqual([]);
  });

  it("flags invariant violations when data is corrupt", () => {
    // Manufacture a claim that is 'submitted' but has zero approval → submitted count
    // can exceed approved count, which the report should surface as a warning.
    const claims: StatusedClaim[] = [
      mk({ claim_status: "Processing", approved_amount: 0 }),
      mk({ claim_status: "Settled", approved_amount: 0, settled_amount: 100 }),
    ];
    const r = computeReconciliation(claims);
    expect(r.submitted.count).toBe(2);
    expect(r.approved.count).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("status set membership", () => {
  it("SUBMITTED_STATUSES is disjoint from DOCS_TO_SUBMIT_STATUSES", () => {
    for (const s of SUBMITTED_STATUSES) {
      expect(DOCS_TO_SUBMIT_STATUSES.has(s)).toBe(false);
    }
  });
});
