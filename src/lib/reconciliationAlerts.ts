import type { Claim } from "@/data/mockClaims";
import { SETTLED_STATUSES } from "./claimStatusBuckets";

export interface ReconciliationAlertConfig {
  /** Max acceptable shortfall (settled vs approved-minus-tds) as a percentage. */
  shortfallTolerancePct: number;
  /** Expected TDS rate (%) — anything above this on a settled claim is flagged. */
  expectedTdsPct: number;
  /** Absolute rupee minimum before we bother alerting. Filters out noise. */
  minShortfallInr: number;
}

export const DEFAULT_ALERT_CONFIG: ReconciliationAlertConfig = {
  shortfallTolerancePct: 2,
  expectedTdsPct: 10,
  minShortfallInr: 500,
};

const STORAGE_KEY = "rcm-buddy-recon-alert-config";

export function loadAlertConfig(): ReconciliationAlertConfig {
  if (typeof localStorage === "undefined") return DEFAULT_ALERT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ALERT_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_ALERT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_ALERT_CONFIG;
  }
}

export function saveAlertConfig(config: ReconciliationAlertConfig): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

export type AlertSeverity = "high" | "medium" | "low";
export type AlertKind = "settlement_short" | "tds_excess" | "unsettled_paid";

export interface ReconciliationAlert {
  claim: Claim;
  kind: AlertKind;
  severity: AlertSeverity;
  expected: number;
  actual: number;
  gap: number;
  gapPct: number;
  reason: string;
}

/** Compute all reconciliation alerts for a set of claims under the given config. */
export function computeAlerts(claims: Claim[], config: ReconciliationAlertConfig): ReconciliationAlert[] {
  const alerts: ReconciliationAlert[] = [];
  for (const c of claims) {
    const status = (c.claim_status || "").toLowerCase().trim();
    const isSettled = SETTLED_STATUSES.has(status);
    if (!isSettled) continue;
    const approved = c.approved_amount || 0;
    const settled = c.settled_amount || 0;
    const tds = c.tds_amount || 0;
    if (approved <= 0) continue;

    // 1. Settlement shortfall (settled + tds should ≈ approved)
    const expected = approved;
    const actual = settled + tds;
    const gap = expected - actual;
    const gapPct = expected > 0 ? (gap / expected) * 100 : 0;
    if (gap >= config.minShortfallInr && gapPct >= config.shortfallTolerancePct) {
      alerts.push({
        claim: c,
        kind: "settlement_short",
        severity: gapPct >= 10 ? "high" : gapPct >= 5 ? "medium" : "low",
        expected,
        actual,
        gap,
        gapPct: +gapPct.toFixed(2),
        reason: `Settled ₹${settled.toLocaleString("en-IN")} + TDS ₹${tds.toLocaleString("en-IN")} falls ${gapPct.toFixed(1)}% short of approved ₹${approved.toLocaleString("en-IN")}.`,
      });
    }

    // 2. TDS excess (deduction higher than expected rate)
    if (settled > 0) {
      const tdsPct = (tds / (settled + tds)) * 100;
      if (tdsPct > config.expectedTdsPct + 0.5) {
        alerts.push({
          claim: c,
          kind: "tds_excess",
          severity: tdsPct >= config.expectedTdsPct + 5 ? "high" : "medium",
          expected: (settled + tds) * (config.expectedTdsPct / 100),
          actual: tds,
          gap: tds - (settled + tds) * (config.expectedTdsPct / 100),
          gapPct: +tdsPct.toFixed(2),
          reason: `TDS rate ${tdsPct.toFixed(1)}% exceeds expected ${config.expectedTdsPct}% — verify certificate.`,
        });
      }
    }

    // 3. Marked settled but zero cash received
    if (settled <= 0 && tds <= 0) {
      alerts.push({
        claim: c,
        kind: "unsettled_paid",
        severity: "high",
        expected: approved,
        actual: 0,
        gap: approved,
        gapPct: 100,
        reason: "Status is settled but no settled amount or TDS was recorded.",
      });
    }
  }
  return alerts.sort((a, b) => b.gap - a.gap);
}

export const ALERT_LABELS: Record<AlertKind, string> = {
  settlement_short: "Short payment",
  tds_excess: "TDS excess",
  unsettled_paid: "Marked settled · zero cash",
};
