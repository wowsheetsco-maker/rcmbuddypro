import { useEffect, useMemo, useState } from "react";
import { Building2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "rcm-buddy-filter-tpa";

function loadSelected(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

/** Shared hook so dashboard filtering reacts to popover changes. */
export function useTpaFilter() {
  const [selected, setSelectedState] = useState<string[]>(loadSelected);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSelectedState(loadSelected());
    };
    const onCustom = () => setSelectedState(loadSelected());
    window.addEventListener("storage", onStorage);
    window.addEventListener("rcm-tpa-filter-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("rcm-tpa-filter-change", onCustom);
    };
  }, []);
  const setSelected = (next: string[]) => {
    setSelectedState(next);
    if (next.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("rcm-tpa-filter-change"));
  };
  const matches = (tpa: string | null | undefined) => {
    if (selected.length === 0) return true;
    return selected.includes((tpa || "Unknown").trim());
  };
  return { selected, setSelected, matches };
}

interface Props {
  options: string[];
}

export default function TpaInsurerFilter({ options }: Props) {
  const { selected, setSelected } = useTpaFilter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const sortedOptions = useMemo(
    () => Array.from(new Set(options.map((o) => (o || "Unknown").trim()))).sort(),
    [options],
  );
  const filtered = useMemo(
    () => sortedOptions.filter((o) => o.toLowerCase().includes(q.toLowerCase())),
    [sortedOptions, q],
  );

  const toggle = (name: string) => {
    if (selected.includes(name)) setSelected(selected.filter((s) => s !== name));
    else setSelected([...selected, name]);
  };

  const label = selected.length === 0
    ? "All TPAs / Insurers"
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          <span className="text-xs truncate max-w-[160px]">{label}</span>
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{selected.length}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            TPA / Insurer
          </span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="h-7 text-xs mb-2"
        />
        <div className="max-h-64 overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2 text-center">No matches</div>
          ) : (
            filtered.map((name) => {
              const active = selected.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted/60",
                    active && "bg-primary/10 text-primary",
                  )}
                >
                  <span className="truncate">{name}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
