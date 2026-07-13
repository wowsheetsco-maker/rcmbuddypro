/**
 * Per-appeal checklist state — tracks which suggested corrective actions
 * from the payer/denial-code playbook have been completed, and when each
 * step is due.
 *
 * Persisted in localStorage keyed by appeal id so it survives reloads
 * without needing a schema migration.
 */

const KEY = "rcm.appeal-checklist.v2";
const LEGACY_KEY = "rcm.appeal-checklist.v1";

export interface ChecklistItem {
  text: string;
  done: boolean;
  doneAt?: string;
  /** ISO date string (YYYY-MM-DD) — optional. */
  dueAt?: string;
}

export type ChecklistMap = Record<string, ChecklistItem[]>;

export type ReminderStatus = "none" | "overdue" | "due_soon" | "on_track" | "done";

function load(): ChecklistMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ChecklistMap;
    // Migrate v1 → v2 (schema compatible, just add missing dueAt).
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as ChecklistMap;
      window.localStorage.setItem(KEY, JSON.stringify(parsed));
      return parsed;
    }
    return {};
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

/** Default due date offset per suggested step (business-day-ish, calendar days). */
const DEFAULT_DUE_DAYS = [1, 2, 3, 5, 7, 10, 14];

function defaultDueFor(index: number): string {
  const days = DEFAULT_DUE_DAYS[index] ?? DEFAULT_DUE_DAYS[DEFAULT_DUE_DAYS.length - 1];
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Return the checklist for one appeal, seeding from the given steps if empty. */
export function getChecklist(appealId: string, steps: string[]): ChecklistItem[] {
  const map = load();
  const existing = map[appealId];
  if (existing && existing.length === steps.length &&
      existing.every((it, i) => it.text === steps[i])) {
    return existing;
  }
  // Seed / re-seed while preserving completion + due for matching text.
  const prev = new Map((existing ?? []).map((it) => [it.text, it]));
  const seeded = steps.map((text, i) => {
    const p = prev.get(text);
    if (p) return { ...p, text };
    return { text, done: false, dueAt: defaultDueFor(i) };
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

export function setChecklistDue(appealId: string, index: number, dueAt: string | undefined): ChecklistItem[] {
  const map = load();
  const list = map[appealId] ? [...map[appealId]] : [];
  if (!list[index]) return list;
  list[index] = { ...list[index], dueAt: dueAt || undefined };
  map[appealId] = list;
  save(map);
  return list;
}

export function reminderStatus(item: ChecklistItem, now = new Date()): ReminderStatus {
  if (item.done) return "done";
  if (!item.dueAt) return "none";
  const due = new Date(item.dueAt + "T23:59:59");
  if (Number.isNaN(due.getTime())) return "none";
  const diffMs = due.getTime() - now.getTime();
  const diffDays = diffMs / 86_400_000;
  if (diffDays < 0) return "overdue";
  if (diffDays <= 2) return "due_soon";
  return "on_track";
}

export interface ChecklistSummary {
  done: number;
  total: number;
  overdue: number;
  dueSoon: number;
  onTrack: number;
}

export function getSummary(appealId: string): ChecklistSummary {
  const list = load()[appealId];
  if (!list?.length) return { done: 0, total: 0, overdue: 0, dueSoon: 0, onTrack: 0 };
  const now = new Date();
  let done = 0, overdue = 0, dueSoon = 0, onTrack = 0;
  for (const it of list) {
    if (it.done) { done += 1; continue; }
    const s = reminderStatus(it, now);
    if (s === "overdue") overdue += 1;
    else if (s === "due_soon") dueSoon += 1;
    else if (s === "on_track") onTrack += 1;
  }
  return { done, total: list.length, overdue, dueSoon, onTrack };
}

/** Bulk-read summaries for many appeals in a single localStorage load. */
export function getSummaryMap(appealIds: string[]): Record<string, ChecklistSummary> {
  const map = load();
  const now = new Date();
  const out: Record<string, ChecklistSummary> = {};
  for (const id of appealIds) {
    const list = map[id];
    if (!list?.length) {
      out[id] = { done: 0, total: 0, overdue: 0, dueSoon: 0, onTrack: 0 };
      continue;
    }
    let done = 0, overdue = 0, dueSoon = 0, onTrack = 0;
    for (const it of list) {
      if (it.done) { done += 1; continue; }
      const s = reminderStatus(it, now);
      if (s === "overdue") overdue += 1;
      else if (s === "due_soon") dueSoon += 1;
      else if (s === "on_track") onTrack += 1;
    }
    out[id] = { done, total: list.length, overdue, dueSoon, onTrack };
  }
  return out;
}

export function getChecklistRaw(appealId: string): ChecklistItem[] {
  return load()[appealId] ?? [];
}

/** Return every persisted checklist, keyed by appeal id. */
export function getAllChecklists(): ChecklistMap {
  return load();
}
