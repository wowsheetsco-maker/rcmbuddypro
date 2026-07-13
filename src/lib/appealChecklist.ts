/**
 * Per-appeal checklist state — tracks which suggested corrective actions
 * from the payer/denial-code playbook have been completed.
 *
 * Persisted in localStorage keyed by appeal id so it survives reloads
 * without needing a schema migration. Each entry stores completion state
 * plus the corrective-step text the box represents, so if the playbook
 * changes later we still show what was originally checked.
 */

const KEY = "rcm.appeal-checklist.v1";

export interface ChecklistItem {
  text: string;
  done: boolean;
  doneAt?: string;
}

export type ChecklistMap = Record<string, ChecklistItem[]>;

function load(): ChecklistMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ChecklistMap) : {};
  } catch {
    return {};
  }
}

function save(m: ChecklistMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Return the checklist for one appeal, seeding from the given steps if empty. */
export function getChecklist(appealId: string, steps: string[]): ChecklistItem[] {
  const map = load();
  const existing = map[appealId];
  if (existing && existing.length === steps.length &&
      existing.every((it, i) => it.text === steps[i])) {
    return existing;
  }
  // Seed / re-seed while preserving completion flags whose text matches.
  const prev = new Map((existing ?? []).map((it) => [it.text, it]));
  const seeded = steps.map((text) => {
    const p = prev.get(text);
    return p ? { ...p, text } : { text, done: false };
  });
  map[appealId] = seeded;
  save(map);
  return seeded;
}

export function setChecklistItem(appealId: string, index: number, done: boolean): ChecklistItem[] {
  const map = load();
  const list = map[appealId] ? [...map[appealId]] : [];
  if (!list[index]) return list;
  list[index] = {
    ...list[index],
    done,
    doneAt: done ? new Date().toISOString() : undefined,
  };
  map[appealId] = list;
  save(map);
  return list;
}

export function getProgress(appealId: string): { done: number; total: number } {
  const list = load()[appealId];
  if (!list || list.length === 0) return { done: 0, total: 0 };
  return { done: list.filter((i) => i.done).length, total: list.length };
}

/** Bulk-read progress for many appeals in a single localStorage load. */
export function getProgressMap(appealIds: string[]): Record<string, { done: number; total: number }> {
  const map = load();
  const out: Record<string, { done: number; total: number }> = {};
  for (const id of appealIds) {
    const list = map[id];
    out[id] = list?.length
      ? { done: list.filter((i) => i.done).length, total: list.length }
      : { done: 0, total: 0 };
  }
  return out;
}
