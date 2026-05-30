import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** KPI card skeleton — matches the hero metric layout. */
export function KpiCardSkeleton({ hero = false, className }: { hero?: boolean; className?: string }) {
  return (
    <Card variant={hero ? "hero" : "default"} className={className}>
      <CardContent className={cn(hero ? "p-6 space-y-3" : "p-4 space-y-2")}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className={cn(hero ? "h-12 w-40" : "h-7 w-28")} />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
}

/** Table rows skeleton — matches the column count of the target table. */
export function TableRowsSkeleton({ rows = 6, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={`tr-sk-${i}`} className="border-b last:border-0">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={`tc-sk-${i}-${j}`} className="py-2.5 px-3">
              <Skeleton className="h-3.5 w-full max-w-[120px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Compact list item skeleton — used in worklist queues, follow-up lists. */
export function ListItemSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border p-2.5">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <div className="space-y-1.5 text-right">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3 w-12 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Claim drawer skeleton — header + tabs + body shape. */
export function ClaimDrawerSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
