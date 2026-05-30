// Shared helper for splitting a free-text hospital_name like
// "Aster Prime Hospital - Hyderabad" into a (group, branch) pair.
//
// Used by both the import pipeline (to auto-tag claims with
// hospital_group_id / hospital_branch_id) and the Settings page
// (to preview how unmapped names will be split).

export interface SplitName {
  group: string;
  branch: string;
}

const SEPARATORS: { sep: string }[] = [
  { sep: " - " },
  { sep: " – " },
  { sep: ", " },
  { sep: " | " },
];

/**
 * Splits a raw hospital name into a group + branch.
 * - Splits on the FIRST occurrence of any separator (` - `, ` – `, `, `, ` | `).
 * - Falls back to branch="Main" when no separator is found.
 * - Trims whitespace; collapses internal runs of spaces.
 */
export function splitHospitalName(raw: string): SplitName {
  const cleaned = (raw || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return { group: "", branch: "Main" };

  let bestPos = -1;
  let bestSep = "";
  for (const { sep } of SEPARATORS) {
    const pos = cleaned.indexOf(sep);
    if (pos > 0 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos;
      bestSep = sep;
    }
  }
  if (bestPos === -1) return { group: cleaned, branch: "Main" };

  const group = cleaned.slice(0, bestPos).trim();
  const branch = cleaned.slice(bestPos + bestSep.length).trim() || "Main";
  return { group, branch };
}

/** Stable slug for a hospital group name. */
export function slugifyGroupName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
