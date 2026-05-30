// Lightweight per-claim edit history persisted to localStorage.
// Tracks when individual workflow fields were last changed by the user.

export type WorkflowField =
  | "tpa_spoc"
  | "hospital_spoc"
  | "last_communication_at"
  | "last_communication_note"
  | "remarks"
  | "action_plan";

export interface HistoryEntry {
  field: WorkflowField;
  at: string; // ISO timestamp
  preview: string; // truncated new value for display
}

const KEY = "claim_edit_history_v1";
const MAX_PER_CLAIM = 25;

type Store = Record<string, HistoryEntry[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota or disabled */
  }
}

export function getHistory(claimId: string): HistoryEntry[] {
  return read()[claimId] ?? [];
}

export function appendHistory(claimId: string, entries: HistoryEntry[]) {
  if (!entries.length) return;
  const store = read();
  const next = [...entries, ...(store[claimId] ?? [])].slice(0, MAX_PER_CLAIM);
  store[claimId] = next;
  write(store);
}

export function fieldLabel(f: WorkflowField): string {
  switch (f) {
    case "tpa_spoc": return "TPA SPOC";
    case "hospital_spoc": return "Hospital SPOC";
    case "last_communication_at": return "Last Communication";
    case "last_communication_note": return "Communication Note";
    case "remarks": return "Remarks";
    case "action_plan": return "Action Plan";
  }
}

export function preview(value: string | null | undefined): string {
  if (!value) return "(cleared)";
  const s = String(value).replace(/\s+/g, " ").trim();
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}
