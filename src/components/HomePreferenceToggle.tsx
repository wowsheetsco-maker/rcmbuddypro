import { useEffect, useState } from "react";
import { Home, LayoutDashboard } from "lucide-react";
import { getHomePref, setHomePref, HOME_PREF_EVENT, type HomePref } from "@/lib/homePreference";
import { cn } from "@/lib/utils";

/**
 * Small segmented control that lets the user pick which page opens at "/".
 * Persisted in localStorage; broadcast so other tabs/components refresh.
 */
export default function HomePreferenceToggle({ className }: { className?: string }) {
  const [pref, setPref] = useState<HomePref>(() => getHomePref());
  useEffect(() => {
    const h = () => setPref(getHomePref());
    window.addEventListener(HOME_PREF_EVENT, h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener(HOME_PREF_EVENT, h);
      window.removeEventListener("storage", h);
    };
  }, []);

  const update = (v: HomePref) => { setHomePref(v); setPref(v); };

  const btn = (v: HomePref, Icon: typeof Home, label: string) => (
    <button
      type="button"
      onClick={() => update(v)}
      aria-pressed={pref === v}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
        pref === v
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border/60 bg-card p-0.5",
        className,
      )}
      title="Choose what opens when you go Home"
    >
      <span className="pl-2 pr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Home:</span>
      {btn("today", Home, "Today")}
      {btn("dashboard", LayoutDashboard, "Dashboard")}
    </div>
  );
}
