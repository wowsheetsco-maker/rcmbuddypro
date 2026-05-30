import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative animate-pulse rounded-md bg-muted overflow-hidden",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.6s_infinite]",
        "before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.04] before:to-transparent",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
