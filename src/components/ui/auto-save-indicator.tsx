import { Check, Loader2, AlertCircle, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

export type AutoSaveState = "idle" | "saving" | "saved" | "error";

const COPY: Record<AutoSaveState, string> = {
  idle: "All changes saved",
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

/**
 * Linear/Notion-style auto-save indicator.
 * Drop into the header of any data-entry dialog or form.
 */
export function AutoSaveIndicator({
  state,
  className,
  message,
}: {
  state: AutoSaveState;
  className?: string;
  message?: string;
}) {
  const label = message ?? COPY[state];
  const Icon =
    state === "saving" ? Loader2 : state === "error" ? AlertCircle : state === "saved" ? Check : Cloud;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        state === "error" ? "text-denial" : state === "saved" ? "text-success" : "text-muted-foreground",
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", state === "saving" && "animate-spin")} />
      {label}
    </span>
  );
}
