import { useNavigate } from "@/lib/router-compat";
import { AlertTriangle, CalendarClock, IndianRupee, ShieldCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatInrShort } from "@/data/mockClaims";
import { useActionCentreCounts } from "@/hooks/useActionCentreCounts";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { cn } from "@/lib/utils";

interface ChipProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: React.ReactNode;
  tone: "indigo" | "rose" | "amber" | "mint";
  onClick?: () => void;
}

function KpiChip({ icon: Icon, label, value, tone, onClick }: ChipProps) {
  const tones: Record<ChipProps["tone"], { bg: string; ic: string; ring: string }> = {
    indigo: { bg: "bg-[hsl(var(--pastel-indigo))]", ic: "text-primary", ring: "hover:ring-primary/20" },
    rose:   { bg: "bg-[hsl(var(--pastel-rose))]",   ic: "text-rose-600", ring: "hover:ring-rose-300/40" },
    amber:  { bg: "bg-[hsl(var(--pastel-amber))]",  ic: "text-amber-600", ring: "hover:ring-amber-300/40" },
    mint:   { bg: "bg-[hsl(var(--pastel-mint))]",   ic: "text-emerald-600", ring: "hover:ring-emerald-300/40" },
  };
  const t = tones[tone];
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2.5 h-10 rounded-xl px-3 text-left transition-all duration-200",
        "ring-1 ring-transparent hover:-translate-y-px hover:shadow-[0_2px_8px_rgba(16,24,40,0.06)]",
        t.bg, t.ring,
      )}
    >
      <span className={cn("grid h-7 w-7 place-items-center rounded-lg bg-card/60", t.ic)}>
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[13px] font-semibold text-foreground tabular-nums">{value}</span>
        <span className="text-[10.5px] text-muted-foreground font-medium">{label}</span>
      </span>
    </button>
  );
}

export default function ActionCentreBar() {
  const navigate = useNavigate();
  const counts = useActionCentreCounts();
  const { claims } = useLiveClaims();

  const total = claims.length || 1;
  const settled = claims.filter((c) => /paid|settled|closed/i.test(c.claim_status ?? "")).length;
  const onTrackPct = Math.round(((total - counts.irdaiBreaches - counts.overdueFollowUps) / total) * 100);
  const onTrack = Math.max(0, Math.min(100, onTrackPct));

  return (
    <div className="sticky top-[72px] z-20 glass-chrome border-b border-border/60">
      <TooltipProvider delayDuration={150}>
        <div className="flex flex-wrap items-center gap-2 md:gap-2.5 px-4 md:px-6 py-2.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground pr-1">
            Today
          </span>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <KpiChip
                  icon={CalendarClock}
                  label="Follow-ups"
                  value={counts.overdueFollowUps}
                  tone="amber"
                  onClick={() => navigate("/communications/calendar")}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">Overdue follow-ups today</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <KpiChip
                  icon={IndianRupee}
                  label="At Risk"
                  value={formatInrShort(counts.recoveryAtRisk)}
                  tone="rose"
                  onClick={() => navigate("/communications/outstanding-reminders")}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">Outstanding recovery at risk</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <KpiChip
                  icon={AlertTriangle}
                  label="SLA Alerts"
                  value={counts.irdaiBreaches}
                  tone="rose"
                  onClick={() => navigate("/claims/priority")}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">SLA TAT breaches</TooltipContent>
          </Tooltip>

          <KpiChip
            icon={ShieldCheck}
            label="Claims On Track"
            value={`${onTrack}%`}
            tone="mint"
          />

          <div className="ml-auto hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live · {settled.toLocaleString("en-IN")} settled today
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}
