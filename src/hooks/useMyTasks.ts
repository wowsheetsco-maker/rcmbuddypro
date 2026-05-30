import { useMemo } from "react";
import type { Claim } from "@/data/mockClaims";
import type { DbFollowUp } from "@/hooks/useFollowUpData";

export type TaskCategory =
  | "pending_queries"
  | "doc_submission"
  | "outstanding_followup"
  | "discrepancy";

export interface TaskItem {
  id: string;
  category: TaskCategory;
  claim: Claim;
  title: string;
  subtitle: string;
  amount: number;
  severity: "low" | "medium" | "high";
  dueLabel: string;
  daysAging: number;
}

interface DiscrepancyAction {
  id: string;
  claim_id: string;
  status: string;
  flagged_amount: number;
  flag_severity: "low" | "medium" | "high";
}

const SETTLED = new Set(["settled", "paid", "closed", "claim settled"]);
const QUERY_STATUSES = new Set([
  "query raised",
  "query",
  "tpa query",
  "pending query",
  "query pending",
  "under query",
]);
const DOC_STATUSES = new Set([
  "pending docs",
  "documents pending",
  "doc pending",
  "documents required",
  "additional documents",
  "additional documents required",
  "deficiency",
  "document deficiency",
]);

function severityFromAmount(amount: number): "low" | "medium" | "high" {
  if (amount >= 200_000) return "high";
  if (amount >= 50_000) return "medium";
  return "low";
}

function daysAgo(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

interface BuildArgs {
  claims: Claim[];
  followUps: DbFollowUp[];
  discrepancies: DiscrepancyAction[];
  /** providers (TPA / insurer names) the user is responsible for. Empty = all. */
  scopeProviders: string[];
  /** user name — used for auto-fallback when allocations are empty (matches tpa_spoc / logged_by). */
  userName: string | null;
  /** when true, only items whose tpa_spoc matches userName count (auto fallback mode). */
  useAutoFallback: boolean;
  /** optional UI filter to narrow visible TPA. */
  providerFilter?: string;
}

function inScope(claim: Claim, args: BuildArgs): boolean {
  if (args.providerFilter && args.providerFilter !== "all") {
    const f = args.providerFilter.toLowerCase();
    const tpa = (claim.tpa_name || "").toLowerCase();
    const ins = (claim.insurance_company_name || "").toLowerCase();
    if (tpa !== f && ins !== f) return false;
  }
  if (args.scopeProviders.length > 0) {
    const set = new Set(args.scopeProviders.map((p) => p.toLowerCase()));
    const tpa = (claim.tpa_name || "").toLowerCase();
    const ins = (claim.insurance_company_name || "").toLowerCase();
    return set.has(tpa) || set.has(ins);
  }
  if (args.useAutoFallback && args.userName) {
    const n = args.userName.toLowerCase().trim();
    const spoc = (claim.tpa_spoc || "").toLowerCase();
    return spoc.includes(n);
  }
  return true;
}

export function buildTaskList(args: BuildArgs): {
  pending_queries: TaskItem[];
  doc_submission: TaskItem[];
  outstanding_followup: TaskItem[];
  discrepancy: TaskItem[];
} {
  const claimsById = new Map(args.claims.map((c) => [c.id, c]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Latest follow-up per claim (followUps already ordered desc upstream, but resort to be safe)
  const sortedFu = [...args.followUps].sort(
    (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
  );
  const latestFuByClaim = new Map<string, DbFollowUp>();
  for (const fu of sortedFu) if (!latestFuByClaim.has(fu.claim_id)) latestFuByClaim.set(fu.claim_id, fu);

  const pending_queries: TaskItem[] = [];
  const doc_submission: TaskItem[] = [];
  const outstanding_followup: TaskItem[] = [];
  const discrepancy: TaskItem[] = [];

  for (const c of args.claims) {
    const status = (c.claim_status || "").toLowerCase().trim();
    if (SETTLED.has(status)) continue;
    if (!inScope(c, args)) continue;

    const aging = c.days_since_claim;

    // Pending Queries
    if (QUERY_STATUSES.has(status)) {
      pending_queries.push({
        id: `pq-${c.id}`,
        category: "pending_queries",
        claim: c,
        title: "Respond to TPA query",
        subtitle: `${c.claim_number || c.ihx_ref_id} · ${c.patient_name} · ${c.tpa_name}`,
        amount: c.outstanding_amount,
        severity: severityFromAmount(c.outstanding_amount),
        dueLabel: aging > 2 ? `Overdue · ${aging}d` : `${aging}d`,
        daysAging: aging,
      });
    }

    // Document Submission
    if (DOC_STATUSES.has(status) || (!c.doc_submission_date && c.date_of_discharge)) {
      const dischargeDays = daysAgo(c.date_of_discharge);
      if (DOC_STATUSES.has(status) || (!c.doc_submission_date && dischargeDays > 2)) {
        doc_submission.push({
          id: `ds-${c.id}`,
          category: "doc_submission",
          claim: c,
          title: c.doc_submission_date
            ? "Resubmit documents"
            : "Submit claim documents",
          subtitle: `${c.claim_number || c.ihx_ref_id} · ${c.patient_name} · ${c.tpa_name}`,
          amount: c.outstanding_amount || c.claimed_amount,
          severity: severityFromAmount(c.outstanding_amount || c.claimed_amount),
          dueLabel: dischargeDays ? `${dischargeDays}d since discharge` : `${aging}d`,
          daysAging: aging,
        });
      }
    }
  }

  // Outstanding Follow-up — overdue follow_ups whose claim is open & in scope
  for (const fu of sortedFu) {
    const c = claimsById.get(fu.claim_id);
    if (!c) continue;
    const status = (c.claim_status || "").toLowerCase().trim();
    if (SETTLED.has(status)) continue;
    if (!inScope(c, args)) continue;
    const next = new Date(fu.next_action_date).getTime();
    if (Number.isNaN(next) || next > todayMs) continue;
    // Dedupe by claim — only most recent overdue
    if (outstanding_followup.some((t) => t.claim.id === c.id)) continue;
    const overdueDays = Math.max(0, Math.floor((todayMs - next) / 86_400_000));
    outstanding_followup.push({
      id: `of-${fu.id}`,
      category: "outstanding_followup",
      claim: c,
      title: "Follow up — action overdue",
      subtitle: `${c.claim_number || c.ihx_ref_id} · ${c.patient_name} · ${c.tpa_name}`,
      amount: c.outstanding_amount,
      severity: overdueDays > 7 ? "high" : overdueDays > 2 ? "medium" : "low",
      dueLabel: overdueDays === 0 ? "Due today" : `Overdue · ${overdueDays}d`,
      daysAging: c.days_since_claim,
    });
  }

  // Discrepancy
  for (const d of args.discrepancies) {
    const c = claimsById.get(d.claim_id);
    if (!c) continue;
    const status = (c.claim_status || "").toLowerCase().trim();
    if (SETTLED.has(status)) continue;
    if (!inScope(c, args)) continue;
    if (d.status === "resolved") continue;
    discrepancy.push({
      id: `dx-${d.id}`,
      category: "discrepancy",
      claim: c,
      title: "Raise / pursue discrepancy",
      subtitle: `${c.claim_number || c.ihx_ref_id} · ${c.patient_name} · ${c.tpa_name}`,
      amount: d.flagged_amount || c.outstanding_amount,
      severity: d.flag_severity,
      dueLabel: `${c.days_since_claim}d aging`,
      daysAging: c.days_since_claim,
    });
  }

  // Sort each bucket by amount desc
  const sortByAmount = (a: TaskItem, b: TaskItem) => b.amount - a.amount;
  pending_queries.sort(sortByAmount);
  doc_submission.sort(sortByAmount);
  outstanding_followup.sort(sortByAmount);
  discrepancy.sort(sortByAmount);

  return { pending_queries, doc_submission, outstanding_followup, discrepancy };
}

export function useTaskBuckets(args: BuildArgs) {
  return useMemo(() => buildTaskList(args), [
    args.claims,
    args.followUps,
    args.discrepancies,
    args.scopeProviders.join("|"),
    args.userName,
    args.useAutoFallback,
    args.providerFilter,
  ]);
}
