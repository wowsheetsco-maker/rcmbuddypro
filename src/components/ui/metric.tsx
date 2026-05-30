import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Unified KPI metric component.
 *
 * Use to enforce visual hierarchy across KPI cards on Executive Dashboard,
 * Today's Worklist, and Analytics. The `hero` size is reserved for the
 * 2–4 most important numbers on a page (CFO scan-line). Supporting metrics
 * use `primary`; everything else uses `secondary` or `meta`.
 */
export interface MetricProps {
  label: string;
  value: React.ReactNode;
  size?: "hero" | "primary" | "secondary" | "meta";
  /** Tone restricted: red is reserved for denial/breach contexts only. */
  tone?: "default" | "success" | "denial" | "muted";
  caption?: React.ReactNode;
  delta?: { value: string; direction: "up" | "down" | "flat"; isGood?: boolean };
  icon?: React.ReactNode;
  className?: string;
}

const VALUE_CLASS: Record<NonNullable<MetricProps["size"]>, string> = {
  hero: "metric-hero",
  primary: "metric-primary",
  secondary: "text-base font-semibold tabular-nums",
  meta: "text-sm font-medium tabular-nums",
};

const TONE_CLASS: Record<NonNullable<MetricProps["tone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  denial: "text-denial",
  muted: "text-muted-foreground",
};

export function Metric({
  label,
  value,
  size = "primary",
  tone = "default",
  caption,
  delta,
  icon,
  className,
}: MetricProps) {
  const isHero = size === "hero";
  return (
    <div className={cn("flex flex-col", isHero ? "gap-2" : "gap-1", className)}>
      <div className="flex items-center gap-1.5 metric-meta">
        {icon}
        <span>{label}</span>
      </div>
      <div className={cn(VALUE_CLASS[size], TONE_CLASS[tone])}>{value}</div>
      {(caption || delta) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {delta && <DeltaPill {...delta} />}
          {caption}
        </div>
      )}
    </div>
  );
}

function DeltaPill({
  value,
  direction,
  isGood,
}: {
  value: string;
  direction: "up" | "down" | "flat";
  isGood?: boolean;
}) {
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const positive = isGood ?? direction === "up";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        positive ? "bg-success/15 text-success" : "bg-denial/10 text-denial",
      )}
    >
      <Icon className="h-3 w-3" /> {value}
    </span>
  );
}
