// Local vault of team-entered claim workflow notes (SPOCs, remarks, action
// plans, last communication). Claims rows can be wiped by a fresh upload or by
// the Data Management "clear all" tool — the vault keeps the team's own work so
// it can be re-attached when the same claim numbers come back in a new sheet.

export const CLAIM_NOTE_FIELDS = [
  "tpa_spoc",
  "hospital_spoc",
  "last_communication_at",
  "last_communication_note",
  "remarks",
  "action_plan",
] as const;

export type ClaimNoteRecord = Record<string, unknown>;

const KEY = "rcm_claim_notes_vault_v1";

function isBlank(v: unknown) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function readNotesVault(): Record<string, ClaimNoteRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, ClaimNoteRecord>) : {};
  } catch {
    return {};
  }
}

/** Merge the given rows (claim_number + note fields) into the vault. */
export function saveNotesVault(rows: ClaimNoteRecord[]) {
  if (typeof window === "undefined") return;
  const store = readNotesVault();
  for (const r of rows) {
    const cn = r.claim_number as string | undefined;
    if (!cn) continue;
    const kept: ClaimNoteRecord = { ...(store[cn] ?? {}) };
    let any = false;
    for (const f of CLAIM_NOTE_FIELDS) {
      if (!isBlank(r[f])) {
        kept[f] = r[f];
        any = true;
      }
    }
    if (any || store[cn]) store[cn] = kept;
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota or disabled */
  }
}

export function clearNotesVault() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
