import { useEffect, useState } from "react";

export type Plan = "starter" | "pro" | "enterprise";

const KEY = "rcm-plan";

/** Returns the current subscription plan. Defaults to "pro". */
export function usePlan(): Plan {
  const [plan, setPlan] = useState<Plan>(() => {
    if (typeof window === "undefined") return "pro";
    return ((localStorage.getItem(KEY) as Plan) || "pro");
  });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) setPlan(e.newValue as Plan);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return plan;
}
