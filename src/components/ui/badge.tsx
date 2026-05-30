import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Healthcare RCM badge tones
 * --------------------------
 *  default     → primary brand chip
 *  secondary   → neutral chip
 *  outline     → bordered, transparent
 *  success     → paid / cleared / settled
 *  warning     → amber for early-warning, NOT errors
 *  destructive → destructive ops (rare)
 *  denial      → denial / SLA breach (the only "red" we want users to notice)
 *  aging-30    → 30–60d aging (amber)
 *  aging-60    → 60–90d aging (orange)
 *  aging-90    → 90+d aging (deep orange/red, but distinct from denial)
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border-transparent bg-muted text-foreground/80 hover:bg-muted/80",
        outline: "text-foreground",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        denial: "border-denial/40 bg-denial/10 text-denial",
        "aging-30": "border-aging-30/40 bg-aging-30/20 text-aging-30-foreground",
        "aging-60": "border-aging-60/40 bg-aging-60/15 text-aging-60",
        "aging-90": "border-aging-90/40 bg-aging-90/15 text-aging-90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Pick the right aging variant for a number of days. */
export function agingVariant(days: number, isBreach = false): BadgeProps["variant"] {
  if (isBreach) return "denial";
  if (days >= 90) return "aging-90";
  if (days >= 60) return "aging-60";
  if (days >= 30) return "aging-30";
  return "secondary";
}

export { Badge, badgeVariants };
