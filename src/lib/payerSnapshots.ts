import type { PayerStats } from "./payerScorecard";

const STORAGE_KEY = "rcm.payerSnapshots.v1";
const MAX_SNAPSHOTS = 12; // keep ~last year of monthly snapshots

export interface PayerSnapshot {
  id: string;
  label: string;
  /** ISO timestamp. */
  takenAt: string;
  view: "tpa" | "insurer";
  /** Slim copy of stats — keep only what we render in deltas. */
  payers: Array<
    Pick<
      PayerStats,
      | "name"
      | "claims"
      | "outstanding"
      | "approved"
      | "settled"
      | "netRealPct"
      | "approvalPct"
      | "avgTat"
      | "discPct"
      | "score"
      | "grade"
    >
  >;
}

function readAll(): PayerSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PayerSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(snaps: PayerSnapshot[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps));
}

export function listSnapshots(view?: "tpa" | "insurer"): PayerSnapshot[] {
  const all = readAll().sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  return view ? all.filter((s) => s.view === view) : all;
}

export function saveSnapshot(input: {
  label: string;
  view: "tpa" | "insurer";
  payers: PayerStats[];
}): PayerSnapshot {
  const snap: PayerSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: input.label.trim() || new Date().toLocaleString("en-IN"),
    takenAt: new Date().toISOString(),
    view: input.view,
    payers: input.payers.map((p) => ({
      name: p.name,
      claims: p.claims,
      outstanding: p.outstanding,
      approved: p.approved,
      settled: p.settled,
      netRealPct: p.netRealPct,
      approvalPct: p.approvalPct,
      avgTat: p.avgTat,
      discPct: p.discPct,
      score: p.score,
      grade: p.grade,
    })),
  };
  const next = [snap, ...readAll()].slice(0, MAX_SNAPSHOTS);
  writeAll(next);
  return snap;
}

export function deleteSnapshot(id: string) {
  writeAll(readAll().filter((s) => s.id !== id));
}

export interface PayerDelta {
  name: string;
  prev?: PayerSnapshot["payers"][number];
  curr: PayerStats;
  /** + means metric improved (higher better, except TAT/Disc where lower better). */
  netRealDelta: number;
  approvalDelta: number;
  tatDelta: number;
  discDelta: number;
  scoreDelta: number;
  outstandingDelta: number;
}

/** Compute deltas of current payers vs a baseline snapshot. */
export function diffAgainstSnapshot(
  current: PayerStats[],
  snap: PayerSnapshot | null,
): PayerDelta[] {
  if (!snap) return current.map((c) => emptyDelta(c));
  const byName = new Map(snap.payers.map((p) => [p.name.toLowerCase(), p]));
  return current.map((c) => {
    const prev = byName.get(c.name.toLowerCase());
    if (!prev) return emptyDelta(c);
    return {
      name: c.name,
      prev,
      curr: c,
      netRealDelta: +(c.netRealPct - prev.netRealPct).toFixed(1),
      approvalDelta: +(c.approvalPct - prev.approvalPct).toFixed(1),
      tatDelta: c.avgTat - prev.avgTat,
      discDelta: +(c.discPct - prev.discPct).toFixed(1),
      scoreDelta: c.score - prev.score,
      outstandingDelta: c.outstanding - prev.outstanding,
    };
  });
}

function emptyDelta(c: PayerStats): PayerDelta {
  return {
    name: c.name,
    curr: c,
    netRealDelta: 0,
    approvalDelta: 0,
    tatDelta: 0,
    discDelta: 0,
    scoreDelta: 0,
    outstandingDelta: 0,
  };
}
