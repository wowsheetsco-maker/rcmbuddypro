import React, { useMemo, useState } from "react";
import { Loader2, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { RcmIcons } from "@/lib/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, agingVariant } from "@/components/ui/badge";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { ListItemSkeleton } from "@/components/skeletons";
import { countSlaBreaches, countOpenDenials } from "@/lib/claimMetrics";
import AppLayout from "@/components/AppLayout";
import ClaimDrawer from "@/components/ClaimDrawer";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useFollowUpData } from "@/hooks/useFollowUpData";
import { type Claim, formatInr, formatDays } from "@/data/mockClaims";

const SETTLED = new Set(["settled", "paid", "closed", "claim settled"]);
const DENIED = /denied|rejected|repudiat/i;

interface QueueItem {
  claim: Claim;
  reason: string;
  ageLabel: string;
  amount: number;
}

export default function TodaysWorklistPage() {
  const { claims, loading, isMock, refetch } = useLiveClaims();
  const { followUps, loading: fuLoading } = useFollowUpData();
  const [selected, setSelected] = useState<Claim | null>(null);

  const claimsById = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);

  const buckets = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const todayMs = today.getTime();

    // Follow-ups due (overdue or due today) — dedupe to latest per claim
    const seenFu = new Set<string>();
    const followUpsDue: QueueItem[] = [];
    const sorted = [...followUps].sort(
      (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
    );
    for (const fu of sorted) {
      if (seenFu.has(fu.claim_id)) continue;
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

    // Denials due — denied/rejected with outstanding > 0
    const denialsDue: QueueItem[] = [];
    for (const c of claims) {
      const status = (c.claim_status || "").toLowerCase().trim();
      if (SETTLED.has(status)) continue;
      if (!DENIED.test(c.claim_status)) continue;
      if (c.outstanding_amount <= 0) continue;
      denialsDue.push({
        claim: c,
        reason: c.claim_status,
        ageLabel: `${formatDays(c.days_since_claim)} since claim`,
        amount: c.outstanding_amount,
      });
    }

    // SLA breaches in 48h — already breaching OR within 2 days of 15-day TAT
    const irdai48: QueueItem[] = [];
    for (const c of claims) {
      const status = (c.claim_status || "").toLowerCase().trim();
      if (SETTLED.has(status)) continue;
      const days = c.days_since_claim;
      const breach = c.is_irdai_breach;
      const closeToBreach = !breach && days >= 13 && days <= 15;
      if (!breach && !closeToBreach) continue;
      irdai48.push({
        claim: c,
        reason: breach ? `Breached · ${formatDays(days)}` : `Breaches in ${formatDays(Math.max(0, 15 - days))}`,
        ageLabel: `${formatDays(days)} / 15 d TAT`,
        amount: c.outstanding_amount,
      });
    }

    const byAmount = (a: QueueItem, b: QueueItem) => b.amount - a.amount;
    followUpsDue.sort(byAmount);
    denialsDue.sort(byAmount);
    irdai48.sort(byAmount);
    return { followUpsDue, denialsDue, irdai48 };
  }, [claims, followUps, claimsById]);

  const isLoading = loading || fuLoading;
  const totalItems =
    buckets.followUpsDue.length + buckets.denialsDue.length + buckets.irdai48.length;
  const totalAtRisk =
    [...buckets.followUpsDue, ...buckets.denialsDue, ...buckets.irdai48].reduce(
      (s, i) => s + i.amount,
      0,
    );

  const slaBreaches = useMemo(() => countSlaBreaches(claims), [claims]);
  const openDenials = useMemo(() => countOpenDenials(claims), [claims]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display text-foreground">Today's Worklist</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2">
            {isLoading ? "Loading your queue…" : "Items needing action right now"}
            {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            {isMock && !isLoading && (
              <Badge variant="outline" className="text-[9px] py-0">Sample data</Badge>
            )}
          </p>
        </div>

        <KpiGrid cols={4}>
          <KpiCard
            label="Items in queue"
            value={totalItems.toLocaleString("en-IN")}
            loading={isLoading}
            empty={!isLoading && totalItems === 0}
            icon={<RcmIcons.worklist className="h-3.5 w-3.5 text-primary" />}
            caption="Follow-ups + denials + SLA"
          />
          <KpiCard
            label="At risk"
            value={formatInr(totalAtRisk)}
            tone="denial"
            loading={isLoading}
            empty={!isLoading && totalAtRisk === 0}
            icon={<RcmIcons.amount className="h-3.5 w-3.5 text-denial" />}
            caption="Outstanding across queue"
          />
          <KpiCard
            label="SLA breaches"
            value={slaBreaches}
            tone="denial"
            loading={isLoading}
            empty={!isLoading && slaBreaches === 0}
            icon={<RcmIcons.irdaiBreach className="h-3.5 w-3.5 text-denial" />}
            caption=">15 day TAT"
          />
          <KpiCard
            label="Open denials"
            value={openDenials}
            loading={isLoading}
            empty={!isLoading && openDenials === 0}
            icon={<RcmIcons.denial className="h-3.5 w-3.5 text-destructive" />}
            caption="With outstanding > 0"
          />
        </KpiGrid>


        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <QueueCard
            title="Follow-ups due"
            icon={RcmIcons.followUp}
            tone="text-primary"
            items={buckets.followUpsDue}
            loading={isLoading}
            onOpen={setSelected}
            empty="No follow-ups overdue. Nice work."
          />
          <QueueCard
            title="Denials to action"
            icon={RcmIcons.denial}
            tone="text-denial"
            items={buckets.denialsDue}
            loading={isLoading}
            onOpen={setSelected}
            empty="No open denials right now."
          />
          <QueueCard
            title="SLA breach in 48h"
            icon={RcmIcons.irdaiBreach}
            tone="text-denial"
            items={buckets.irdai48}
            loading={isLoading}
            onOpen={setSelected}
            empty="No claims approaching the 15-day TAT."
          />
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
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  items: QueueItem[];
  loading: boolean;
  empty: string;
  onOpen: (c: Claim) => void;
}

function QueueCard({ title, icon: Icon, tone, items, loading, empty, onOpen }: QueueCardProps) {
  const visible = items.slice(0, 8);
  const more = items.length - visible.length;
  const isDenialQueue =
    title.toLowerCase().includes("denial") || title.toLowerCase().includes("irdai");
  return (
    <Card variant={isDenialQueue && items.length > 0 ? "denial" : "default"} className="flex flex-col">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className={`h-4 w-4 ${tone}`} />
          {title}
        </CardTitle>
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
                        {it.claim.tpa_name}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">
                      {formatInr(it.amount)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{it.ageLabel}</div>
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
