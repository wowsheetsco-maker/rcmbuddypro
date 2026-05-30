// Reminder Automation — manage scheduled email reminders to TPAs/Insurers.
// Per-TPA recurring schedules with global aging-bucket fallback rules.
// Each rule pulls claims (pending / discrepancies / SLA breaches / denied),
// builds an Excel attachment and sends via the existing reminder pipeline.

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Plus, Play, Pencil, Trash2, Mail, Clock, AlertTriangle,
  CheckCircle2, XCircle, Filter, Search,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useReminderSchedules, type ReminderSchedule,
} from "@/hooks/useReminderSchedules";
import ReminderRuleDialog from "@/components/ReminderRuleDialog";
import { cn } from "@/lib/utils";

const cadenceLabel = (s: ReminderSchedule) => {
  const t = `${String(s.send_hour).padStart(2, "0")}:${String(s.send_minute).padStart(2, "0")}`;
  switch (s.cadence) {
    case "daily": return `Daily · ${t} IST`;
    case "weekly": {
      const d = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.day_of_week ?? 1];
      return `Weekly · ${d} ${t}`;
    }
    case "biweekly": {
      const d = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][s.day_of_week ?? 1];
      return `Every 2 weeks · ${d} ${t}`;
    }
    case "monthly": return `Monthly · day ${s.day_of_month ?? 1} · ${t}`;
    case "every_n_days": return `Every ${s.every_n_days ?? 7} days · ${t}`;
  }
};

const statusBadge = (status: string) => {
  switch (status) {
    case "sent":
      return <Badge variant="outline" className="bg-accent/15 text-accent-foreground border-accent/30 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Sent
      </Badge>;
    case "failed":
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>;
    case "skipped":
      return <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
        <AlertTriangle className="h-3 w-3" /> Skipped
      </Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function AutomationPage() {
  const { schedules, runs, loading, upsert, remove, toggleActive, runNow } =
    useReminderSchedules();

  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "tpa" | "global">("all");
  const [editing, setEditing] = useState<ReminderSchedule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ReminderSchedule | null>(null);

  const filtered = useMemo(() => {
    return schedules.filter((s) => {
      if (scopeFilter !== "all" && s.scope !== scopeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.tpa_name ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [schedules, search, scopeFilter]);

  const kpis = useMemo(() => {
    const active = schedules.filter((s) => s.is_active).length;
    const sentToday = runs.filter(
      (r) => r.status === "sent" &&
        r.sent_at && new Date(r.sent_at).toDateString() === new Date().toDateString(),
    ).length;
    const failed = runs.filter((r) => r.status === "failed").length;
    const next = schedules
      .filter((s) => s.is_active && s.next_run_at)
      .map((s) => new Date(s.next_run_at!).getTime())
      .sort((a, b) => a - b)[0];
    return { active, sentToday, failed, next };
  }, [schedules, runs]);

  return (
    <AppLayout>
      <div className="px-4 md:px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reminder Automation</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Schedule automated email reminders to TPAs / Insurers. Each rule pulls
              pending claims, discrepancies and SLA breaches, then sends with an Excel attachment.
            </p>
          </div>
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> New Rule
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 border-t-4 border-t-primary">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-semibold">
              <Mail className="h-3.5 w-3.5" /> Active Rules
            </div>
            <div className="text-2xl font-bold mt-2">{kpis.active}</div>
            <div className="text-xs text-muted-foreground mt-1">of {schedules.length} total</div>
          </Card>
          <Card className="p-4 border-t-4 border-t-accent">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-accent-foreground font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Sent Today
            </div>
            <div className="text-2xl font-bold mt-2">{kpis.sentToday}</div>
            <div className="text-xs text-muted-foreground mt-1">automated dispatches</div>
          </Card>
          <Card className="p-4 border-t-4 border-t-destructive">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-destructive font-semibold">
              <XCircle className="h-3.5 w-3.5" /> Failures
            </div>
            <div className="text-2xl font-bold mt-2">{kpis.failed}</div>
            <div className="text-xs text-muted-foreground mt-1">recent · check log</div>
          </Card>
          <Card className="p-4 border-t-4 border-t-secondary">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-secondary font-semibold">
              <Clock className="h-3.5 w-3.5" /> Next Run
            </div>
            <div className="text-lg font-bold mt-2">
              {kpis.next ? format(new Date(kpis.next), "dd MMM · HH:mm") : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">cron fires every minute</div>
          </Card>
        </div>

        <Tabs defaultValue="rules">
          <TabsList>
            <TabsTrigger value="rules">Rules ({schedules.length})</TabsTrigger>
            <TabsTrigger value="runs">Run History ({runs.length})</TabsTrigger>
          </TabsList>

          {/* Rules tab */}
          <TabsContent value="rules" className="space-y-3 pt-3">
            <Card className="p-3 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search rule / TPA…"
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <div className="flex gap-1 ml-auto">
                {(["all", "tpa", "global"] as const).map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={scopeFilter === v ? "default" : "outline"}
                    onClick={() => setScopeFilter(v)}
                    className="h-9 capitalize"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {v === "all" ? "All" : v === "tpa" ? "Per-TPA" : "Global"}
                  </Button>
                ))}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-foreground hover:bg-foreground">
                    <TableHead className="text-background uppercase text-xs tracking-wider">Rule</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider">Scope</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider">Cadence</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider">Includes</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider">Next Run</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider text-center">Active</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                        Loading rules…
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                        No reminder rules yet. Click <strong>New Rule</strong> to set one up.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((s) => {
                    const inc: string[] = [];
                    if (s.include_pending) inc.push("Pending");
                    if (s.include_discrepancies) inc.push("Discrepancy");
                    if (s.include_irdai_breaches) inc.push("SLA");
                    if (s.include_denied) inc.push("Denied");
                    return (
                      <TableRow key={s.id} className={cn(!s.is_active && "opacity-60")}>
                        <TableCell>
                          <div className="font-medium text-sm">{s.name}</div>
                          {s.notes && <div className="text-[11px] text-muted-foreground">{s.notes}</div>}
                        </TableCell>
                        <TableCell>
                          {s.scope === "tpa" ? (
                            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                              {s.tpa_name ?? "—"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-secondary/15 text-secondary-foreground border-secondary/30">
                              Global · {s.aging_bucket ?? "all"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{cadenceLabel(s)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {inc.length === 0
                              ? <span className="text-xs text-muted-foreground">none</span>
                              : inc.map((x) => (
                                <Badge key={x} variant="outline" className="text-[10px]">{x}</Badge>
                              ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {s.next_run_at ? format(new Date(s.next_run_at), "dd MMM · HH:mm") : "—"}
                          {s.last_run_at && (
                            <div className="text-[10px] text-muted-foreground">
                              last: {format(new Date(s.last_run_at), "dd MMM HH:mm")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={s.is_active}
                            onCheckedChange={(v) => toggleActive(s.id, v)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm" variant="outline"
                              onClick={() => runNow(s.id)}
                              className="h-8 text-xs bg-accent/15 text-accent-foreground border-accent/30 hover:bg-accent/25"
                            >
                              <Play className="h-3.5 w-3.5" /> Run now
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              onClick={() => { setEditing(s); setDialogOpen(true); }}
                              className="h-8 text-xs"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              onClick={() => setConfirmDelete(s)}
                              className="h-8 text-xs text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            <p className="text-xs text-muted-foreground">
              💡 Recipients fall back to <strong>Settings → Contacts</strong> if no
              override is set. The cron runs every minute and sends one email per TPA
              with an Excel attachment of all matching claims.
            </p>
          </TabsContent>

          {/* Run history tab */}
          <TabsContent value="runs" className="space-y-3 pt-3">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-foreground hover:bg-foreground">
                    <TableHead className="text-background uppercase text-xs tracking-wider">When</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider">Rule</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider">TPA</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider">Recipient</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider text-right">Claims</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider">Status</TableHead>
                    <TableHead className="text-background uppercase text-xs tracking-wider">Trigger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                        No dispatches yet.
                      </TableCell>
                    </TableRow>
                  ) : runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(r.created_at), "dd MMM HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-xs">{r.schedule_name ?? "—"}</TableCell>
                      <TableCell className="text-xs font-medium">{r.tpa_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <div>{r.recipient_email ?? "—"}</div>
                        {r.error_message && (
                          <div className="text-[10px] text-destructive truncate max-w-xs" title={r.error_message}>
                            {r.error_message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {r.claim_count}
                        {r.irdai_breach_count > 0 && (
                          <span className="text-destructive"> · {r.irdai_breach_count} breach</span>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-xs capitalize">{r.trigger_kind}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ReminderRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSave={upsert}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reminder rule?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" will be removed. Run history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) void remove(confirmDelete.id);
                setConfirmDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
