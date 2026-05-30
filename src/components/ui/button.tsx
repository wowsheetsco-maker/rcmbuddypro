import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Healthcare RCM button hierarchy
 * --------------------------------
 *  default      → primary action (teal-blue, shadow, semibold)
 *  secondary    → supportive action (tinted surface, no shadow)
 *  outline      → tertiary (1px border)
 *  ghost        → quaternary (text-only, hover surface)
 *  destructive  → destructive ops only (delete claims, purge data)
 *  denial       → denial / appeal CTAs — uses --denial token
 *  success      → confirm / mark cleared
 *
 * On a row showing a denial: use `default` for "Appeal" and `ghost` for
 * "View" so the primary action is visually unambiguous.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground font-semibold shadow-sm hover:bg-primary/90 hover:shadow-md active:translate-y-px active:shadow-sm",
        secondary:
          "bg-secondary/10 text-secondary border border-transparent hover:bg-secondary/15",
        outline:
          "border border-input bg-background hover:bg-accent/10 hover:text-accent hover:border-accent/40",
        ghost:
          "hover:bg-muted text-foreground/80 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        destructive:
          "bg-destructive text-destructive-foreground font-semibold shadow-sm hover:bg-destructive/90 hover:shadow-md",
        denial:
          "bg-denial text-denial-foreground font-semibold shadow-sm hover:bg-denial/90",
        "denial-outline":
          "border border-denial/40 text-denial bg-transparent hover:bg-denial/10",
        success:
          "bg-success text-success-foreground font-semibold shadow-sm hover:bg-success/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-6",
        xl: "h-12 rounded-md px-8 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
