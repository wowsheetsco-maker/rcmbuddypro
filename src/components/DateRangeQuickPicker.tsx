import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGlobalFilter } from "@/components/global-filter-context";
import { cn } from "@/lib/utils";

type PresetId = "7d" | "30d" | "90d" | "mtd" | "qtd" | "ytd" | "12m" | "all" | "custom";

function startOf(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function rangeForPreset(id: PresetId): { from: Date | null; to: Date | null } {
  const today = startOf(new Date());
  switch (id) {
    case "7d": return { from: addDays(today, -6), to: today };
    case "30d": return { from: addDays(today, -29), to: today };
    case "90d": return { from: addDays(today, -89), to: today };
    case "mtd": return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case "qtd": {
      const q = Math.floor(today.getMonth() / 3) * 3;
      return { from: new Date(today.getFullYear(), q, 1), to: today };
    }
    case "ytd": return { from: new Date(today.getFullYear(), 0, 1), to: today };
    case "12m": return { from: addDays(today, -364), to: today };
    case "all":
    default: return { from: null, to: null };
  }
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "mtd", label: "Month to date" },
  { id: "qtd", label: "Quarter to date" },
  { id: "ytd", label: "Year to date" },
  { id: "12m", label: "Last 12 months" },
  { id: "all", label: "All time" },
];

export default function DateRangeQuickPicker({ className }: { className?: string }) {
  const { from, to, setFrom, setTo } = useGlobalFilter();
  const [open, setOpen] = useState(false);

  const activeLabel = useMemo(() => {
    if (!from && !to) return "All time";
    // Try to match a preset
    for (const p of PRESETS) {
      const r = rangeForPreset(p.id);
      const sameFrom = (r.from?.getTime() ?? null) === (from?.getTime() ?? null);
      const sameTo = (r.to?.getTime() ?? null) === (to?.getTime() ?? null);
      if (sameFrom && sameTo) return p.label;
    }
    const f = from ? format(from, "dd MMM yyyy") : "—";
    const t = to ? format(to, "dd MMM yyyy") : "—";
    return `${f} → ${t}`;
  }, [from, to]);

  const durationDays = useMemo(() => {
    if (!from || !to) return null;
    return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  }, [from, to]);

  function apply(id: PresetId) {
    const r = rangeForPreset(id);
    setFrom(r.from);
    setTo(r.to);
    if (id !== "custom") setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 font-normal", className)}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[12px] font-medium truncate max-w-[180px]">{activeLabel}</span>
          {durationDays != null && (
            <span className="ml-1 rounded-sm bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold">
              {durationDays}d
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 pointer-events-auto">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-col gap-0.5 p-2 border-r sm:w-44">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quick range
            </div>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => apply(p.id)}
                className="text-left text-[12px] px-2 py-1.5 rounded hover:bg-muted transition-colors"
              >
                {p.label}
              </button>
            ))}
            {(from || to) && (
              <button
                type="button"
                onClick={() => { setFrom(null); setTo(null); }}
                className="mt-1 text-left text-[11px] px-2 py-1.5 rounded text-muted-foreground hover:bg-muted inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
          <div className="p-2">
            <div className="px-2 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Custom range
            </div>
            <Calendar
              mode="range"
              selected={{ from: from ?? undefined, to: to ?? undefined }}
              onSelect={(r) => {
                setFrom(r?.from ? startOf(r.from) : null);
                setTo(r?.to ? startOf(r.to) : null);
              }}
              numberOfMonths={2}
              initialFocus
              className="p-0 pointer-events-auto"
            />
            <div className="flex justify-end gap-2 pt-2 border-t mt-2">
              <Button size="sm" variant="ghost" onClick={() => { setFrom(null); setTo(null); }}>
                Reset
              </Button>
              <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
