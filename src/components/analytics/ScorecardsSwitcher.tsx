import { Link, useLocation } from "@/lib/router-compat";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Unified entity switcher used on top of the three scorecard pages
 * (Payer / Corporate / Staff). The three underlying pages remain
 * separate for now — this bar makes them feel like one hub while we
 * preserve deep links and existing filters.
 */
const ITEMS: Array<{ label: string; entity: "payer" | "corporate" | "staff"; path: string }> = [
  { label: "Payer",     entity: "payer",     path: "/analytics/payer-scorecard" },
  { label: "Corporate", entity: "corporate", path: "/analytics/corporate" },
  { label: "Staff",     entity: "staff",     path: "/analytics/staff-scorecard" },
];

export default function ScorecardsSwitcher() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-1.5">
      <span className="flex items-center gap-1.5 pl-1 pr-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        Scorecards
      </span>
      {ITEMS.map((it) => {
        const active = pathname === it.path;
        return (
          <Link
            key={it.entity}
            to={it.path}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
