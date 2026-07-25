import React, { useEffect, useMemo, useState } from "react";
import { Loader2, ArrowRight, CheckCircle2, Clock, User, Users, Globe2 } from "lucide-react";
import { RcmIcons } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, agingVariant } from "@/components/ui/badge";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { ListItemSkeleton } from "@/components/skeletons";
import AppLayout from "@/components/AppLayout";
import ClaimDrawer from "@/components/ClaimDrawer";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useFollowUpData } from "@/hooks/useFollowUpData";
import { useActingUserId } from "@/hooks/useActingUser";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPlatformAdmin } from "@/hooks/useIsPlatformAdmin";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { type Claim, formatInr, formatDays } from "@/data/mockClaims";
import { isDocsToSubmit } from "@/lib/claimStatusBuckets";
import { cn } from "@/lib/utils";

const SETTLED = new Set(["settled", "paid", "closed", "claim settled"]);
const DENIED = /denied|rejected|repudiat/i;
const QUERY_RX = /query|shortfall|clarification|pending.*info/i;
const HIGH_VALUE_AR_DAYS = 60;

type Scope = "mine" | "team" | "all";
const SCOPE_KEY = "rcm-today-scope";

interface QueueItem {
  claim: Claim;
  reason: string;
  ageLabel: string;
  amount: number;
}

/** Role-based default: junior executives → Mine; managers/admins → Team; owners/platform admins → All. */
function defaultScope(role: string | null, isPlatformAdmin: boolean): Scope {
  if (isPlatformAdmin || role === "owner") return "all";
  if (role === "admin") return "team";
  return "mine";
}

export default function TodaysWorklistPage() {
  const { claims, loading, isMock, refetch } = useLiveClaims();
  const { followUps, loading: fuLoading } = useFollowUpData();
  const [actingUserId] = useActingUserId();
  const { role, isLoading: roleLoading } = useAuth();
  const { isAdmin: isPlatformAdmin, loading: paLoading } = useIsPlatformAdmin();
  const { teamIds } = useTeamMembers();
  const [selected, setSelected] = useState<Claim | null>(null);

  const [scope, setScope] = useState<Scope | null>(() => {
    try {
      const v = localStorage.getItem(SCOPE_KEY);
      if (v === "mine" || v === "team" || v === "all") return v;
      // Migrate legacy "mine only" switch.
      if (localStorage.getItem("rcm-today-mine-only") === "1") return "mine";
    } catch { /* noop */ }
    return null;
  });

  // Apply role-based default once auth resolves, if the user hasn't chosen yet.
  useEffect(() => {
    if (scope !== null) return;
    if (roleLoading || paLoading) return;
    setScope(defaultScope(role, isPlatformAdmin));
  }, [scope, role, isPlatformAdmin, roleLoading, paLoading]);

  const effectiveScope: Scope = scope ?? "mine";

  const updateScope = (v: Scope) => {
    setScope(v);
    try { localStorage.setItem(SCOPE_KEY, v); } catch { /* noop */ }
  };

  const claimsById = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);

  // Set of app_user ids that satisfy the current scope. `null` means "no filter".
  const ownerSet: Set<string> | null = useMemo(() => {
    if (effectiveScope === "all") return null;
    if (effectiveScope === "mine") {
      return new Set(actingUserId ? [actingUserId] : []);
    }
    // team
    const s = new Set<string>(teamIds);
    if (actingUserId) s.add(actingUserId);
    return s;
  }, [effectiveScope, actingUserId, teamIds]);

  // Claims that someone in the current scope has personally touched (via follow-ups).
  // Used to filter claim-only buckets (docs/denials/AR) where there is no owner column.
  const touchedClaimIds: Set<string> | null = useMemo(() => {
    if (!ownerSet) return null;
    const s = new Set<string>();
    for (const fu of followUps) {
      if (fu.logged_by && ownerSet.has(fu.logged_by)) s.add(fu.claim_id);
    }
    return s;
  }, [followUps, ownerSet]);

  const buckets = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const todayMs = today.getTime();

    // 1) Overdue follow-ups — scoped by logged_by ∈ ownerSet.
    const seenFu = new Set<string>();
    const followUpsDue: QueueItem[] = [];
    const sorted = [...followUps].sort(
      (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
    );
    for (const fu of sorted) {
      if (seenFu.has(fu.claim_id)) continue;
      if (ownerSet && fu.logged_by && !ownerSet.has(fu.logged_by)) continue;
      if (ownerSet && !fu.logged_by && effectiveScope === "mine") continue;
      seenFu.add(fu.claim_id);
      const claim = claimsById.get(fu.claim_id);
      if (!claim) continue;
      const status = (claim.claim_status || "").toLowerCase().trim();
      if (SETTLED.has(status)) continue;
      const next = new Date(fu.next_action_date).getTime();
      if (Number.isNaN(next) || next > todayMs) continue;
      const overdueDays = Math.max(0, Math.floor((Date.now() - next) / 86_400_000));
      followUpsDue.push({
        claim,
        reason: overdueDays === 0 ? "Due today" : `Overdue · ${formatDays(overdueDays)}`,
        ageLabel: `${formatDays(claim.days_since_claim)} aging`,
        amount: claim.outstanding_amount,
      });
    }

    // For claim-only buckets: in "mine" mode we hide claims the acting user hasn't touched.
    // In "team" mode we surface claims teammates have touched PLUS untouched claims (new work).
    // In "all" mode no filter.
    const claimAllowed = (claimId: string) => {
      if (!touchedClaimIds) return true;
      if (effectiveScope === "mine") return touchedClaimIds.has(claimId);
      // team: touched by teammate OR untouched (no follow-ups at all)
      if (touchedClaimIds.has(claimId)) return true;
      return !followUps.some((f) => f.claim_id === claimId);
    };

    // 2) Docs-to-submit — approved/discharged claims awaiting document submission
    const docsToSubmit: QueueItem[] = [];
    for (const c of claims) {
      if (!isDocsToSubmit(c)) continue;
      if (!claimAllowed(c.id)) continue;
      docsToSubmit.push({
        claim: c,
        reason: c.claim_status || "Approved",
        ageLabel: c.date_of_discharge
          ? `${formatDays(Math.max(0, Math.floor((Date.now() - new Date(c.date_of_discharge).getTime()) / 86_400_000)))} since discharge`
          : `${formatDays(c.days_since_claim)} old`,
        amount: c.approved_amount || c.claimed_amount || 0,
      });
    }

    // 3) New denials & queries to action
    const denialsQueries: QueueItem[] = [];
    for (const c of claims) {
      const status = (c.claim_status || "").toLowerCase().trim();
      if (SETTLED.has(status)) continue;
      const isDenial = DENIED.test(c.claim_status);
      const isQuery = QUERY_RX.test(c.claim_status);
      if (!isDenial && !isQuery) continue;
      if (c.outstanding_amount <= 0 && !isQuery) continue;
      if (!claimAllowed(c.id)) continue;
      denialsQueries.push({
        claim: c,
        reason: c.claim_status,
        ageLabel: `${formatDays(c.days_since_claim)} old`,
        amount: c.outstanding_amount || c.approved_amount || 0,
      });
    }

    // 4) High-value AR at risk — outstanding > 0 and > 60 days
    const highValueAr: QueueItem[] = [];
    for (const c of claims) {
      const status = (c.claim_status || "").toLowerCase().trim();
      if (SETTLED.has(status)) continue;
      if (c.outstanding_amount <= 0) continue;
      if (c.days_since_claim < HIGH_VALUE_AR_DAYS) continue;
      if (!claimAllowed(c.id)) continue;
      highValueAr.push({
        claim: c,
        reason: `${formatDays(c.days_since_claim)} old`,
        ageLabel: c.tpa_name || "—",
        amount: c.outstanding_amount,
      });
    }

    const byAmount = (a: QueueItem, b: QueueItem) => b.amount - a.amount;
    followUpsDue.sort(byAmount);
    docsToSubmit.sort(byAmount);
    denialsQueries.sort(byAmount);
    highValueAr.sort(byAmount);
    return { followUpsDue, docsToSubmit, denialsQueries, highValueAr };
  }, [claims, followUps, claimsById, ownerSet, touchedClaimIds, effectiveScope]);


  const isLoading = loading || fuLoading;
  const allItems = [
    ...buckets.followUpsDue,
    ...buckets.docsToSubmit,
    ...buckets.denialsQueries,
    ...buckets.highValueAr,
  ];
  const totalItems = allItems.length;
  const totalAtRisk = allItems.reduce((s, i) => s + i.amount, 0);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground">{greeting} — here's your day</h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
              {isLoading ? "Loading your queue…" : "Four things need your attention right now"}
              {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              {isMock && !isLoading && (
                <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>
              )}
            </p>
          </div>
          <ScopeSelector value={effectiveScope} onChange={updateScope} role={role} isPlatformAdmin={isPlatformAdmin} />
        </div>

        <KpiGrid cols={4}>
          <KpiCard
            label="Follow-ups due"
            value={buckets.followUpsDue.length.toLocaleString("en-IN")}
            loading={isLoading}
            empty={!isLoading && buckets.followUpsDue.length === 0}
            icon={<RcmIcons.followUp className="h-3.5 w-3.5 text-primary" />}
            caption={effectiveScope === "mine" ? "Assigned to me" : effectiveScope === "team" ? "My team" : "Across all users"}
          />
          <KpiCard
            label="Docs to submit"
            value={buckets.docsToSubmit.length.toLocaleString("en-IN")}
            loading={isLoading}
            empty={!isLoading && buckets.docsToSubmit.length === 0}
            icon={<RcmIcons.worklist className="h-3.5 w-3.5 text-primary" />}
            caption="Post-discharge / approved"
          />
          <KpiCard
            label="Denials & queries"
            value={buckets.denialsQueries.length.toLocaleString("en-IN")}
            tone="denial"
            loading={isLoading}
            empty={!isLoading && buckets.denialsQueries.length === 0}
            icon={<RcmIcons.denial className="h-3.5 w-3.5 text-denial" />}
            caption="Awaiting response"
          />
          <KpiCard
            label="AR at risk (>60 d)"
            value={formatInr(totalAtRisk)}
            tone="denial"
            loading={isLoading}
            empty={!isLoading && buckets.highValueAr.length === 0}
            icon={<RcmIcons.amount className="h-3.5 w-3.5 text-denial" />}
            caption={`${buckets.highValueAr.length} claims`}
          />
        </KpiGrid>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <QueueCard
            title="Follow-ups due"
            subtitle={effectiveScope === "mine" ? "Assigned to me" : effectiveScope === "team" ? "My team's overdue or due today" : "Overdue or due today"}
            icon={RcmIcons.followUp}
            tone="text-primary"
            items={buckets.followUpsDue}
            loading={isLoading}
            onOpen={setSelected}
            empty="No follow-ups pending. Nice work."
          />
          <QueueCard
            title="Docs to submit"
            subtitle="Approved / post-discharge claims awaiting docs"
            icon={RcmIcons.worklist}
            tone="text-primary"
            items={buckets.docsToSubmit}
            loading={isLoading}
            onOpen={setSelected}
            empty="No pending document submissions."
          />
          <QueueCard
            title="New denials & queries"
            subtitle="Payer wants a response"
            icon={RcmIcons.denial}
            tone="text-denial"
            items={buckets.denialsQueries}
            loading={isLoading}
            onOpen={setSelected}
            empty="No open denials or queries."
          />
          <QueueCard
            title="High-value AR at risk"
            subtitle=">60 days old with outstanding"
            icon={RcmIcons.amount}
            tone="text-denial"
            items={buckets.highValueAr}
            loading={isLoading}
            onOpen={setSelected}
            empty="No aged AR beyond 60 days."
          />
        </div>

        <div className="text-[11px] text-muted-foreground text-center">
          {totalItems} items · {formatInr(totalAtRisk)} at stake ·
          {" "}
          <span className="underline decoration-dotted" title="This is your landing page. Detailed dashboards live under Analytics.">
            Full dashboards →
          </span>
        </div>
      </div>

      {selected && (
        <ClaimDrawer
          claim={selected}
          onClose={() => setSelected(null)}
          onUpdated={(patch) => {
            setSelected((c) => (c ? { ...c, ...patch } : c));
            void refetch();
          }}
        />
      )}
    </AppLayout>
  );
}

interface QueueCardProps {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  items: QueueItem[];
  loading: boolean;
  empty: string;
  onOpen: (c: Claim) => void;
}

function QueueCard({ title, subtitle, icon: Icon, tone, items, loading, empty, onOpen }: QueueCardProps) {
  const visible = items.slice(0, 8);
  const more = items.length - visible.length;
  const isDenialQueue =
    title.toLowerCase().includes("denial") || title.toLowerCase().includes("ar at risk");
  return (
    <Card variant={isDenialQueue && items.length > 0 ? "denial" : "default"} className="flex flex-col">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Icon className={`h-4 w-4 ${tone}`} />
            {title}
          </CardTitle>
          {subtitle && (
            <div className="text-[10.5px] text-muted-foreground mt-0.5 ml-6">{subtitle}</div>
          )}
        </div>
        <Badge variant={isDenialQueue && items.length > 0 ? "denial" : "secondary"} className="tabular-nums">
          {loading ? "—" : items.length}
        </Badge>
      </CardHeader>
      <CardContent className="pt-0 flex-1">
        {loading ? (
          <ListItemSkeleton count={4} />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground gap-2">
            <CheckCircle2 className="h-6 w-6 text-success/70" />
            {empty}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {visible.map((it) => (
              <li key={`${title}-${it.claim.id}`}>
                <button
                  onClick={() => onOpen(it.claim)}
                  className="w-full text-left rounded-md border border-border bg-card hover:bg-muted/40 transition-colors p-2.5 flex items-center gap-2 group"
                  data-testid="worklist-item"
                  data-claim-id={it.claim.id}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-medium text-sm truncate">{it.claim.patient_name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                        {it.claim.claim_number}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge
                        variant={agingVariant(it.claim.days_since_claim, isDenialQueue)}
                        className="py-0 px-1.5 normal-case tracking-normal"
                      >
                        <Clock className="h-2.5 w-2.5 mr-0.5" /> {it.reason}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {it.ageLabel}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">
                      {formatInr(it.amount)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{it.claim.tpa_name}</div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </button>
              </li>
            ))}
            {more > 0 && (
              <li className="text-[11px] text-muted-foreground text-center pt-1">
                + {more} more
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface ScopeSelectorProps {
  value: Scope;
  onChange: (v: Scope) => void;
  role: string | null;
  isPlatformAdmin: boolean;
}

function ScopeSelector({ value, onChange, role, isPlatformAdmin }: ScopeSelectorProps) {
  const options: { key: Scope; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
    { key: "mine", label: "Mine", icon: User, hint: "Only claims & follow-ups I own" },
    { key: "team", label: "My team", icon: Users, hint: "Everyone in my organization" },
    { key: "all", label: "All", icon: Globe2, hint: "Every user, every branch" },
  ];
  const defaultKey: Scope = isPlatformAdmin || role === "owner" ? "all" : role === "admin" ? "team" : "mine";
  return (
    <div className="flex flex-col items-end gap-1">
      <div
        role="tablist"
        aria-label="Worklist scope"
        className="inline-flex items-center rounded-md border bg-card p-0.5"
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              role="tab"
              aria-selected={active}
              title={opt.hint}
              onClick={() => onChange(opt.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {opt.label}
            </button>
          );
        })}
      </div>
      <span className="text-[10px] text-muted-foreground">
        Default for your role: <span className="font-medium">{defaultKey}</span>
      </span>
    </div>
  );
}

