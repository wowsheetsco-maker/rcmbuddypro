import { AlertTriangle, Bell, Calendar, Check, ScrollText, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import {
  useNotificationPrefs,
  type PrefKey,
} from "@/hooks/useNotificationPrefs";
import { useNotifications } from "@/hooks/useNotifications";

const PREF_META: Record<PrefKey, { label: string; desc: string; icon: typeof Bell }> = {
  sla_breach: { label: "SLA Breach Alerts", desc: "Get notified when a claim exceeds 30-day TAT threshold", icon: AlertTriangle },
  follow_up_due: { label: "Follow-up Reminders", desc: "Reminders for scheduled follow-up dates", icon: Calendar },
  contract_expiry: { label: "Contract Expiry Warnings", desc: "Alert when contracts are approaching renewal date", icon: ScrollText },
  claim_aging: { label: "Claim Aging Alerts", desc: "Notify when claims exceed 45, 60, 90 days", icon: TrendingUp },
  denial_spike: { label: "Denial Spike Detection", desc: "Alert when denial rate exceeds threshold for a TPA", icon: AlertTriangle },
  payment_received: { label: "Payment Received", desc: "Notify when payment is updated for a claim", icon: Bell },
};

const PREF_ORDER: PrefKey[] = [
  "sla_breach",
  "follow_up_due",
  "contract_expiry",
  "claim_aging",
  "denial_spike",
  "payment_received",
];

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationsPage() {
  const { prefs, loading: prefsLoading, setPref } = useNotificationPrefs();
  const { items, unreadCount, markRead, markAllRead, loading: notifLoading } =
    useNotifications();

  const handleToggle = async (key: PrefKey, val: boolean) => {
    try {
      await setPref(key, val);
      toast.success(val ? "Alert enabled" : "Alert disabled", {
        description: PREF_META[key].label,
      });
    } catch {
      toast.error("Could not save preference");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display text-foreground">Notification Preferences</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure alerts for SLA breaches, follow-ups, and contract renewals
            </p>
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={() => void markAllRead()}>
              <Check className="h-3.5 w-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Preferences
            </h2>
            {prefsLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-lg" />
                ))
              : PREF_ORDER.map((key) => {
                  const meta = PREF_META[key];
                  const p = prefs[key];
                  const Icon = meta.icon;
                  return (
                    <Card key={key} className="shadow-sm">
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{meta.label}</div>
                          <div className="text-[11px] text-muted-foreground">{meta.desc}</div>
                          <Badge variant="outline" className="text-[9px] mt-1">
                            {p.channel}
                          </Badge>
                        </div>
                        <Switch
                          checked={p.enabled}
                          onCheckedChange={(v) => void handleToggle(key, v)}
                        />
                      </CardContent>
                    </Card>
                  );
                })}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Recent Notifications
              </h2>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {unreadCount} unread
                </Badge>
              )}
            </div>
            {notifLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))
            ) : items.length === 0 ? (
              <Card className="shadow-sm">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  You're all caught up.
                </CardContent>
              </Card>
            ) : (
              items.map((n) => (
                <Card
                  key={n.id}
                  className={`shadow-sm cursor-pointer transition-colors hover:bg-accent/30 ${
                    !n.read ? "border-l-2 border-l-primary" : ""
                  }`}
                  onClick={() => !n.read && void markRead(n.id)}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-2">
                      <Bell
                        className={`h-4 w-4 mt-0.5 ${
                          !n.read ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{n.title}</div>
                        {n.message && (
                          <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {timeAgo(n.created_at)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
