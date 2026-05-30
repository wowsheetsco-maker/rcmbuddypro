import * as React from "react";
import { Check, ChevronDown, Filter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ColumnFilterOption {
  value: string;
  label: string;
}

interface ColumnFilterProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ColumnFilterOption[];
  /** Value treated as "no filter" (default: "all") */
  allValue?: string;
  className?: string;
  align?: "start" | "end";
}

/**
 * Inline filter dropdown rendered inside a TableHead.
 * Renders the column label + a chevron; opens a menu of options.
 * Shows an active dot when a non-default value is selected.
 */
export function ColumnFilter({
  label,
  value,
  onChange,
  options,
  allValue = "all",
  className,
  align = "start",
}: ColumnFilterProps) {
  const active = value !== allValue;
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide",
            "text-sidebar-foreground/90 hover:text-sidebar-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm px-0.5 -mx-0.5",
            active && "text-primary",
            className,
          )}
          aria-label={`Filter ${label}`}
        >
          {active ? <Filter className="h-3 w-3" /> : null}
          <span className="truncate">
            {label}
            {active && current ? `: ${current.label}` : ""}
          </span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="max-h-72 overflow-y-auto w-56"
      >
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="text-xs flex items-center justify-between gap-2"
          >
            <span className="truncate">{opt.label}</span>
            {opt.value === value && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
