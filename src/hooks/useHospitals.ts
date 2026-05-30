import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface HospitalGroup {
  id: string;
  name: string;
  slug: string;
  notes: string | null;
}

export interface HospitalBranch {
  id: string;
  group_id: string;
  name: string;
  city: string | null;
  raw_name: string | null;
  notes: string | null;
}

export interface UseHospitalsResult {
  groups: HospitalGroup[];
  branches: HospitalBranch[];
  loading: boolean;
  refetch: () => Promise<void>;
}

// Module-level shared cache + pub/sub so every consumer (filter dropdown,
// dashboard breakdown, settings page) shares the same data and stays in sync.
let cachedGroups: HospitalGroup[] | null = null;
let cachedBranches: HospitalBranch[] | null = null;
let inflight: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const cb of subscribers) cb();
}

export function bumpHospitalsVersion() {
  cachedGroups = null;
  cachedBranches = null;
  void fetchShared().then(notify);
}

async function fetchShared(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const [groupsRes, branchesRes] = await Promise.all([
      supabase.from("hospital_groups").select("*").order("name"),
      supabase.from("hospital_branches").select("*").order("name"),
    ]);
    cachedGroups = (groupsRes.data ?? []) as HospitalGroup[];
    cachedBranches = (branchesRes.data ?? []) as HospitalBranch[];
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

export function useHospitals(): UseHospitalsResult {
  const [, force] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const cb = () => {
      if (mounted.current) force((n) => n + 1);
    };
    subscribers.add(cb);
    if (cachedGroups === null) {
      void fetchShared().then(notify);
    }
    return () => {
      mounted.current = false;
      subscribers.delete(cb);
    };
  }, []);

  const refetch = useCallback(async () => {
    cachedGroups = null;
    cachedBranches = null;
    await fetchShared();
    notify();
  }, []);

  return {
    groups: cachedGroups ?? [],
    branches: cachedBranches ?? [],
    loading: cachedGroups === null,
    refetch,
  };
}
