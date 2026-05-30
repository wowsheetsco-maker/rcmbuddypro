// Reusable Email · WhatsApp · Call action group used in row Action cells
// across Priority Worklist, Discrepancy Tracker, Outstanding Reminders, etc.
//
// The visual treatment (solid filled buttons + split-chevron template picker)
// is the platform-standard "row action" affordance — keep it consistent.

import { ChevronDown } from "lucide-react";
import { RcmIcons } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FollowUpTone } from "@/components/BulkFollowUpComposer";

interface Props {
  onEmail: (tone: FollowUpTone) => void;
  onWhatsApp: (role: string) => void;
  onCall: () => void;
  /** Hide the call button when no phone affordance exists (e.g. bulk row). */
  showCall?: boolean;
  /** Compact = 6×6, comfortable = 7×7. */
  size?: "sm" | "md";
}

export default function RowActionButtons({
  onEmail,
  onWhatsApp,
  onCall,
  showCall = true,
  size = "sm",
}: Props) {
  const h = size === "sm" ? "h-6" : "h-7";
  const w = size === "sm" ? "w-6" : "w-7";
  const icon = "h-3.5 w-3.5";

  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {/* Email split-button */}
      <div className="inline-flex items-center rounded-md border border-secondary bg-secondary hover:bg-secondary/90 transition-colors overflow-hidden shadow-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onEmail("formal")}
              className={`${h} ${w} inline-flex items-center justify-center text-secondary-foreground`}
              aria-label="Send email"
            >
              <RcmIcons.email className={icon} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px]">Email · formal reminder</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`${h} w-3.5 inline-flex items-center justify-center text-secondary-foreground border-l border-secondary-foreground/30 hover:bg-secondary/70`}
              aria-label="Pick email template"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Email templates
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onEmail("formal")} title="Polite, professional first reminder">
              <RcmIcons.email className="h-3.5 w-3.5 mr-2 text-secondary shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">Formal reminder</span>
                <span className="text-[10px] text-muted-foreground">Standard polite follow-up</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEmail("urgent")} title="Firm escalation for stalled claims">
              <RcmIcons.warning className="h-3.5 w-3.5 mr-2 text-orange-500 shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">Urgent escalation</span>
                <span className="text-[10px] text-muted-foreground">Firm tone — overdue claims</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEmail("irdai")} title="Cites IRDAI TAT breach (>15 days)">
              <RcmIcons.irdaiBreach className="h-3.5 w-3.5 mr-2 text-destructive shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">SLA breach notice</span>
                <span className="text-[10px] text-muted-foreground">Cites IRDAI TAT breach</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEmail("friendly")} title="Casual nudge for early-stage claims">
              <RcmIcons.followUp className="h-3.5 w-3.5 mr-2 text-primary shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">Friendly nudge</span>
                <span className="text-[10px] text-muted-foreground">Casual early-stage check-in</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* WhatsApp split-button */}
      <div className="inline-flex items-center rounded-md border border-emerald-700 bg-emerald-700 hover:bg-emerald-800 transition-colors overflow-hidden shadow-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onWhatsApp("billing")}
              className={`${h} ${w} inline-flex items-center justify-center text-white`}
              aria-label="Send WhatsApp"
            >
              <RcmIcons.whatsapp className={icon} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px]">WhatsApp · billing template</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`${h} w-3.5 inline-flex items-center justify-center text-white border-l border-white/30 hover:bg-emerald-800`}
              aria-label="Pick WhatsApp template"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
              WhatsApp templates
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onWhatsApp("billing")} title="Payment / outstanding chase to billing desk">
              <RcmIcons.amount className="h-3.5 w-3.5 mr-2 text-emerald-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">Billing follow-up</span>
                <span className="text-[10px] text-muted-foreground">Chase outstanding payment</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onWhatsApp("claims")} title="Status check with claims processing team">
              <RcmIcons.document className="h-3.5 w-3.5 mr-2 text-secondary shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">Claims status check</span>
                <span className="text-[10px] text-muted-foreground">Processing / query update</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onWhatsApp("spoc")} title="Escalate to TPA / Insurer SPOC">
              <RcmIcons.team className="h-3.5 w-3.5 mr-2 text-primary shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">SPOC escalation</span>
                <span className="text-[10px] text-muted-foreground">Escalate to TPA SPOC</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onWhatsApp("any")} title="Browse all saved WhatsApp templates">
              <RcmIcons.whatsapp className="h-3.5 w-3.5 mr-2 shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">All templates…</span>
                <span className="text-[10px] text-muted-foreground">Browse full template library</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Call — direct action */}
      {showCall && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCall}
              className={`${h} ${w} inline-flex items-center justify-center rounded-md border border-primary bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm`}
              aria-label="Call"
            >
              <RcmIcons.call className={icon} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px]">Call SPOC</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
