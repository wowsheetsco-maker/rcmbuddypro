import { useMemo, useState } from "react";
import { Building2, Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useHospitals } from "@/hooks/useHospitals";
import { useGlobalFilter } from "@/components/global-filter-context";
import { cn } from "@/lib/utils";

/**
 * Compact picker for the top action bar — lets the user pin one or more
 * hospital branches as the global scope. Selecting a branch automatically
 * scopes every dashboard, follow-up, and report.
 */
export default function BranchPicker() {
  const { groups, branches, loading } = useHospitals();
  const {
    groupIds, setGroupIds, branchIds, setBranchIds,
  } = useGlobalFilter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const branchesByGroup = useMemo(() => {
    const map = new Map<string, typeof branches>();
    for (const b of branches) {
      const arr = map.get(b.group_id) ?? [];
      arr.push(b);
      map.set(b.group_id, arr);
    }
    return map;
  }, [branches]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      if (g.name.toLowerCase().includes(q)) return true;
      const branchList = branchesByGroup.get(g.id) ?? [];
      return branchList.some((b) => b.name.toLowerCase().includes(q));
    });
  }, [groups, branchesByGroup, query]);

  const groupSet = new Set(groupIds);
  const branchSet = new Set(branchIds);
  const totalSelected = groupSet.size + branchSet.size;

  const label = useMemo(() => {
    if (totalSelected === 0) return "All branches";
    if (branchSet.size === 1 && groupSet.size === 0) {
      const b = branches.find((x) => branchSet.has(x.id));
      const g = b ? groups.find((x) => x.id === b.group_id) : null;
      return b && g ? `${g.name} · ${b.name}` : "1 branch";
    }
    if (groupSet.size === 1 && branchSet.size === 0) {
      const g = groups.find((x) => groupSet.has(x.id));
      return g ? `${g.name} · all branches` : "1 group";
    }
    return `${totalSelected} selected`;
  }, [totalSelected, branchSet, groupSet, branches, groups]);

  const toggleGroup = (id: string) => {
    if (groupSet.has(id)) setGroupIds(groupIds.filter((x) => x !== id));
    else setGroupIds([...groupIds, id]);
  };
  const toggleBranch = (id: string) => {
    if (branchSet.has(id)) setBranchIds(branchIds.filter((x) => x !== id));
    else setBranchIds([...branchIds, id]);
  };
  const clearAll = () => {
    setGroupIds([]);
    setBranchIds([]);
  };

  if (loading && groups.length === 0) {
    return null;
  }
  if (groups.length === 0) {
    // Nothing to filter — keep the bar clean
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 bg-card/40 border-border/40 text-foreground/90 hover:bg-card/70 px-2.5",
            totalSelected > 0 && "border-primary/40 bg-primary/10",
          )}
        >
          <Building2 className="h-3.5 w-3.5 opacity-70" />
          <span className="text-[11px] max-w-[14rem] truncate">{label}</span>
          {totalSelected > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] tabular-nums">
              {totalSelected}
            </Badge>
          )}
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b p-2">
          <Input
            placeholder="Search hospital or branch…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-[12px]"
          />
        </div>
        <div className="max-h-72 overflow-auto py-1">
          {filteredGroups.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No matches
            </div>
          )}
          {filteredGroups.map((g) => {
            const branchList = branchesByGroup.get(g.id) ?? [];
            const groupSelected = groupSet.has(g.id);
            return (
              <div key={g.id} className="px-1 pb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-accent",
                    groupSelected && "bg-primary/10 text-primary",
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        groupSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="font-medium truncate">{g.name}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {branchList.length} branch{branchList.length === 1 ? "" : "es"}
                  </span>
                </button>
                {branchList.map((b) => {
                  const selected = branchSet.has(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleBranch(b.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md pl-7 pr-2 py-1 text-left text-[12px] hover:bg-accent",
                        selected && "bg-primary/10 text-primary",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-3 w-3 shrink-0",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">{b.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between border-t p-2">
          <span className="text-[10px] text-muted-foreground">
            {totalSelected} selected
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-[11px]"
            onClick={clearAll}
            disabled={totalSelected === 0}
          >
            <X className="h-3 w-3" /> Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
