import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface GlobalFilterValue {
  from: Date | null;
  to: Date | null;
  setFrom: (d: Date | null) => void;
  setTo: (d: Date | null) => void;
  /** Selected hospital group IDs (empty = all). */
  groupIds: string[];
  setGroupIds: (ids: string[]) => void;
  /** Selected hospital branch IDs (empty = all). */
  branchIds: string[];
  setBranchIds: (ids: string[]) => void;
  clear: () => void;
  /** Returns true if the given YYYY-MM-DD (or ISO) date string is within range. */
  isWithin: (dateStr: string | null | undefined) => boolean;
  /** Returns true if a claim matches the active group/branch filter. */
  matchesBranch: (claim: {
    hospital_group_id?: string | null;
    hospital_branch_id?: string | null;
  }) => boolean;
}

const GlobalFilterContext = createContext<GlobalFilterValue | null>(null);

const FROM_KEY = "rcm-buddy-filter-from";
const TO_KEY = "rcm-buddy-filter-to";
const GROUPS_KEY = "rcm-buddy-filter-groups";
const BRANCHES_KEY = "rcm-buddy-filter-branches";

function parse(s: string | null): Date | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : new Date(t);
}

function parseList(s: string | null): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function GlobalFilterProvider({ children }: { children: React.ReactNode }) {
  const [from, setFromState] = useState<Date | null>(() =>
    typeof window === "undefined" ? null : parse(localStorage.getItem(FROM_KEY)),
  );
  const [to, setToState] = useState<Date | null>(() =>
    typeof window === "undefined" ? null : parse(localStorage.getItem(TO_KEY)),
  );
  const [groupIds, setGroupIdsState] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : parseList(localStorage.getItem(GROUPS_KEY)),
  );
  const [branchIds, setBranchIdsState] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : parseList(localStorage.getItem(BRANCHES_KEY)),
  );

  const setFrom = (d: Date | null) => {
    setFromState(d);
    if (d) localStorage.setItem(FROM_KEY, d.toISOString());
    else localStorage.removeItem(FROM_KEY);
  };
  const setTo = (d: Date | null) => {
    setToState(d);
    if (d) localStorage.setItem(TO_KEY, d.toISOString());
    else localStorage.removeItem(TO_KEY);
  };
  const setGroupIds = (ids: string[]) => {
    setGroupIdsState(ids);
    if (ids.length > 0) localStorage.setItem(GROUPS_KEY, JSON.stringify(ids));
    else localStorage.removeItem(GROUPS_KEY);
  };
  const setBranchIds = (ids: string[]) => {
    setBranchIdsState(ids);
    if (ids.length > 0) localStorage.setItem(BRANCHES_KEY, JSON.stringify(ids));
    else localStorage.removeItem(BRANCHES_KEY);
  };
  const clear = () => {
    setFrom(null);
    setTo(null);
    setGroupIds([]);
    setBranchIds([]);
  };

  // Keep tabs in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FROM_KEY) setFromState(parse(e.newValue));
      if (e.key === TO_KEY) setToState(parse(e.newValue));
      if (e.key === GROUPS_KEY) setGroupIdsState(parseList(e.newValue));
      if (e.key === BRANCHES_KEY) setBranchIdsState(parseList(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<GlobalFilterValue>(() => {
    const fromMs = from ? new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime() : null;
    const toMs = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59).getTime() : null;
    const groupSet = new Set(groupIds);
    const branchSet = new Set(branchIds);
    return {
      from,
      to,
      setFrom,
      setTo,
      groupIds,
      setGroupIds,
      branchIds,
      setBranchIds,
      clear,
      isWithin: (dateStr) => {
        if (!fromMs && !toMs) return true;
        if (!dateStr) return false;
        const t = new Date(dateStr).getTime();
        if (Number.isNaN(t)) return false;
        if (fromMs && t < fromMs) return false;
        if (toMs && t > toMs) return false;
        return true;
      },
      matchesBranch: (claim) => {
        // Branch filter wins when set; otherwise fall back to group filter.
        if (branchSet.size > 0) {
          return claim.hospital_branch_id ? branchSet.has(claim.hospital_branch_id) : false;
        }
        if (groupSet.size > 0) {
          return claim.hospital_group_id ? groupSet.has(claim.hospital_group_id) : false;
        }
        return true;
      },
    };
  }, [from, to, groupIds, branchIds]);

  return <GlobalFilterContext.Provider value={value}>{children}</GlobalFilterContext.Provider>;
}

export function useGlobalFilter(): GlobalFilterValue {
  const ctx = useContext(GlobalFilterContext);
  if (!ctx) {
    // Allow components to be used outside the provider with a no-op fallback
    return {
      from: null,
      to: null,
      setFrom: () => {},
      setTo: () => {},
      groupIds: [],
      setGroupIds: () => {},
      branchIds: [],
      setBranchIds: () => {},
      clear: () => {},
      isWithin: () => true,
      matchesBranch: () => true,
    };
  }
  return ctx;
}
