import { useMemo } from "react";
import { useNavigate } from "@/lib/router-compat";
import {
  Phone, ShieldAlert, ListChecks, Bot, Search, FileWarning,
  TrendingUp, AlertTriangle, ChevronRight, Bell, Menu, Receipt,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useGlobalFilter } from "@/components/global-filter-context";
import { formatInrShort } from "@/data/mockClaims";
import { useViewMode } from "@/hooks/useViewMode";

const SETTLED = new Set(["settled", "paid", "closed"]);
const DENIED = new Set([
  "pre auth denied", "claim denied", "discharge denied",
  "enhancement denied", "denied", "rejected",
]);

interface KpiTileProps {
  label: string;
  value: string;
  caption?: string;
  tone: "primary" | "danger" | "warn" | "success" | "info";
  icon: React.ElementType;
  onClick: () => void;
}

function KpiTile({ label, value, caption, tone, icon: Icon, onClick }: KpiTileProps) {
  const toneCls = {
    primary: "border-primary/30 bg-primary/5",
    danger: "border-destructive/30 bg-destructive/5",
    warn: "border-warning/30 bg-warning/5",
    success: "border-success/30 bg-success/5",
    info: "border-secondary/30 bg-secondary/5",
  }[tone];
  const iconCls = {
    primary: "text-primary",
    danger: "text-destructive",
    warn: "text-warning",
    success: "text-success",
    info: "text-secondary",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border ${toneCls} p-3 active:scale-[0.98] transition-transform min-h-[88px] flex flex-col justify-between`}
    >
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${iconCls} shrink-0`} />
      </div>
      <div>
        <div className="text-xl font-semibold tabular-nums leading-none">{value}</div>
        {caption && (
          <div className="text-[10.5px] text-muted-foreground mt-1 leading-tight">{caption}</div>
        )}
      </div>
    </button>
  );
}

interface QuickActionProps {
  label: string;
  icon: React.ElementType;
  to: string;
  tone?: "default" | "primary" | "danger";
}
function QuickAction({ label, icon: Icon, to, tone = "default" }: QuickActionProps) {
  const navigate = useNavigate();
  const cls = tone === "primary"
    ? "bg-primary text-primary-foreground"
    : tone === "danger"
    ? "bg-destructive text-destructive-foreground"
    : "bg-card text-foreground border";
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl ${cls} px-2 py-3 min-h-[72px] active:scale-[0.97] transition-transform`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[11px] font-medium leading-tight text-center">{label}</span>
    </button>
  );
}

export default function MobileHomePage() {
  const navigate = useNavigate();
  const { claims: rawClaims, loading } = useLiveClaims();
  const { matchesBranch } = useGlobalFilter();
  const { setMode } = useViewMode();

  const claims = useMemo(
    () => rawClaims.filter((c) => matchesBranch({
      hospital_group_id: c.hospital_group_id,
      hospital_branch_id: c.hospital_branch_id,
    })),
    [rawClaims, matchesBranch],
  );

  const m = useMemo(() => {
    const outstanding = claims
      .filter((c) => !SETTLED.has((c.claim_status || "").toLowerCase()))
      .reduce((s, c) => s + (c.outstanding_amount || 0), 0);
    const irdai = claims.filter((c) => c.is_irdai_breach).length;
    const denials = claims.filter((c) => DENIED.has((c.claim_status || "").toLowerCase())).length;
    const today = claims.filter((c) => {
      // Claims needing follow-up today (open + last_communication_at older than 3d or never)
      if (SETTLED.has((c.claim_status || "").toLowerCase())) return false;
      if (!c.last_communication_at) return true;
      const days = (Date.now() - new Date(c.last_communication_at).getTime()) / 86_400_000;
      return days >= 3;
    }).length;
    const collectedThisWeek = claims
      .filter((c) => {
        if (!c.payment_update_date) return false;
        const days = (Date.now() - new Date(c.payment_update_date).getTime()) / 86_400_000;
        return days <= 7;
      })
      .reduce((s, c) => s + (c.settled_amount || 0), 0);
    return { outstanding, irdai, denials, today, collectedThisWeek };
  }, [claims]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-md space-y-4 -mt-2">
        {/* Hero greeting */}
        <div className="px-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            {greeting}
          </p>
          <h1 className="text-xl font-semibold mt-0.5">Today's snapshot</h1>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
          </p>
        </div>

        {/* KPI grid */}
        {loading ? (
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <KpiTile
              label="Outstanding"
              value={formatInrShort(m.outstanding)}
              caption="Open claims AR"
              tone="danger"
              icon={TrendingUp}
              onClick={() => navigate("/claims/priority")}
            />
            <KpiTile
              label="SLA Breaches"
              value={String(m.irdai)}
              caption="90+ days past"
              tone={m.irdai > 0 ? "danger" : "success"}
              icon={ShieldAlert}
              onClick={() => navigate("/claims/priority")}
            />
            <KpiTile
              label="Today's Calls"
              value={String(m.today)}
              caption="Pending follow-ups"
              tone="warn"
              icon={Phone}
              onClick={() => navigate("/follow-up")}
            />
            <KpiTile
              label="Collected (7d)"
              value={formatInrShort(m.collectedThisWeek)}
              caption="This week settled"
              tone="success"
              icon={Receipt}
              onClick={() => navigate("/dashboard/executive")}
            />
          </div>
        )}

        {/* Quick actions */}
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
            Quick Actions
          </h2>
          <div className="grid grid-cols-4 gap-2">
            <QuickAction label="Follow-up" icon={Phone} to="/follow-up" tone="primary" />
            <QuickAction label="My Tasks" icon={ListChecks} to="/my-tasks" />
            <QuickAction label="Claims" icon={Search} to="/claims" />
            <QuickAction label="SLA" icon={ShieldAlert} to="/claims/priority" tone="danger" />
            <QuickAction label="Denials" icon={FileWarning} to="/claims/denials" />
            <QuickAction label="AI Reply" icon={Bot} to="/communications/ai-reply" />
            <QuickAction label="Calendar" icon={Bell} to="/communications/calendar" />
            <QuickAction label="Dashboard" icon={TrendingUp} to="/dashboard/executive" />
          </div>
        </div>

        {/* Attention strip */}
        {(m.denials > 0 || m.irdai > 0) && (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-[12px] font-semibold">Needs attention</span>
              </div>
              <ul className="space-y-1.5">
                {m.irdai > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => navigate("/claims/priority")}
                      className="w-full flex items-center justify-between text-left text-[12.5px]"
                    >
                      <span>{m.irdai} SLA breach{m.irdai === 1 ? "" : "es"} — escalate</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </li>
                )}
                {m.denials > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => navigate("/claims/denials")}
                      className="w-full flex items-center justify-between text-left text-[12.5px]"
                    >
                      <span>{m.denials} denied — file appeal</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* View toggle */}
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-[11.5px]"
            onClick={() => {
              try { sessionStorage.removeItem("rcm-mobile-redirected"); } catch { /* noop */ }
              setMode("desktop");
              navigate("/dashboard/executive");
            }}
          >
            Switch to desktop view
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            <Menu className="h-3 w-3 inline mr-0.5" />
            Tap the menu icon for full navigation
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
