import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Metric, type MetricProps } from "@/components/ui/metric";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Canonical KPI card used across every dashboard, worklist, and analytics page.
 *
 * Use this everywhere KPI tiles appear so spacing, typography, icon visibility,
 * tone treatment, loading skeletons and empty-states stay consistent. Don't
 * roll your own <Card>+<Metric> combinations — extend this instead.
 */
export interface KpiCardProps extends Omit<MetricProps, "size" | "value"> {
  value?: MetricProps["value"];
  size?: MetricProps["size"];
  className?: string;
  /** Show a skeleton in place of the value while data is loading. */
  loading?: boolean;
  /** True when the metric has no data to show — renders an em-dash + caption. */
  empty?: boolean;
  /** Override the empty-state placeholder rendered in the value slot. */
  emptyValue?: React.ReactNode;
}

export function KpiCard({
  className,
  size = "primary",
  loading,
  empty,
  emptyValue = "—",
  value,
  caption,
  ...metric
}: KpiCardProps) {
  const displayValue: React.ReactNode = loading ? (
    <Skeleton
      className={cn(
        "rounded-md",
        size === "hero" ? "h-8 w-28" : size === "primary" ? "h-6 w-20" : "h-5 w-16",
      )}
    />
  ) : empty ? (
    <span className="text-muted-foreground">{emptyValue}</span>
  ) : (
    value
  );

  return (
    <Card className={cn("shadow-sm", className)}>
      <CardContent className="pt-4 pb-3 px-4">
        <Metric
          size={size}
          value={displayValue}
          caption={loading ? undefined : caption}
          {...metric}
        />
      </CardContent>
    </Card>
  );
}

/** Standard responsive grid wrapper for KPI strips. */
export function KpiGrid({
  children,
  cols = 4,
  className,
}: {
  children: React.ReactNode;
  /** Number of columns at the lg breakpoint. Mobile is always 2-up. */
  cols?: 3 | 4 | 5 | 6;
  className?: string;
}) {
  const lg =
    cols === 6 ? "lg:grid-cols-6" :
    cols === 5 ? "lg:grid-cols-5" :
    cols === 4 ? "lg:grid-cols-4" :
    "lg:grid-cols-3";
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-3 gap-3", lg, className)}>
      {children}
    </div>
  );
}
