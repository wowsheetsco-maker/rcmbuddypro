// Settings → Team Digests
// - Per-user subscription toggles for Daily / Weekly / Monthly internal status emails
// - Editable subject + body templates per cadence (with token reference)
// - "Send now" button to dispatch a digest immediately
import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, RotateCcw, Send, Sparkles, Mail, Users } from "lucide-react";
import { toast } from "sonner";
import { useAppUsers, ROLES } from "@/hooks/useAppUsers";
import {
  useDigestTemplates, useDigestSubscriptions, useDigestRules,
  DEFAULT_DIGEST_TEMPLATES, DIGEST_TOKENS, MANAGER_ROLES,
  type DigestCadence, type DigestTemplates, type DigestRules,
} from "@/hooks/useTeamDigests";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const CADENCES: { id: DigestCadence; label: string; suggestedRoles: string }[] = [
  { id: "daily",   label: "Daily morning digest",      suggestedRoles: "Billing Executives, Ops" },
  { id: "weekly",  label: "Weekly performance recap",  suggestedRoles: "CEO, CFO, RCM Manager, Ops Manager" },
  { id: "monthly", label: "Monthly RCM scorecard",     suggestedRoles: "CEO, CFO, RCM Manager" },
];

export default function TeamDigestsPage() {
  const { users, loading: usersLoading } = useAppUsers();
  const { templates, loading: tplLoading, saving, save } = useDigestTemplates();
  const { subs, upsert, refetch: refetchSubs } = useDigestSubscriptions();
  const { rules, saving: rulesSaving, save: saveRules } = useDigestRules();

  const [draft, setDraft] = useState<DigestTemplates>(DEFAULT_DIGEST_TEMPLATES);
  const [ruleDraft, setRuleDraft] = useState<DigestRules>(rules);
  const [tab, setTab] = useState<DigestCadence>("daily");
  const [sending, setSending] = useState<DigestCadence | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => { setDraft(templates); }, [templates]);
  useEffect(() => { setRuleDraft(rules); }, [rules]);

  const dirty = (Object.keys(draft) as DigestCadence[]).some((k) =>
    draft[k].subject !== templates[k].subject ||
    draft[k].body !== templates[k].body ||
    draft[k].format !== templates[k].format,
  );

  const subFor = (uid: string) => subs.find((s) => s.app_user_id === uid);

  const handleToggle = async (uid: string, cadence: DigestCadence, value: boolean) => {
    const err = await upsert(uid, { [cadence]: value });
    if (err) toast.error("Could not save subscription", { description: err.message });
  };

  const handleSave = async () => {
    const err = await save(draft);
    if (err) return toast.error("Save failed", { description: err.message });
    toast.success("Digest templates saved");
  };

  const sendNow = async (cadence: DigestCadence) => {
    setSending(cadence);
    try {
      const { data, error } = await supabase.functions.invoke("send-team-digest", {
        body: { cadence, trigger: "manual" },
      });
      if (error) throw new Error(error.message);
      if (data?.success === false) throw new Error(data.error || "Send failed");
      toast.success(`${cadence} digest sent`, {
        description: `${data?.sent ?? 0} recipient(s)`,
      });
    } catch (e) {
      toast.error("Could not send digest", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setSending(null);
    }
  };

  // Counts of currently-subscribed users per cadence
  const counts: Record<DigestCadence, number> = {
    daily:   subs.filter((s) => s.daily).length,
    weekly:  subs.filter((s) => s.weekly).length,
    monthly: subs.filter((s) => s.monthly).length,
  };

  const ruleDirty = (Object.keys(ruleDraft) as DigestCadence[]).some((k) =>
    ruleDraft[k].enabled !== rules[k].enabled ||
    ruleDraft[k].managerRollup !== rules[k].managerRollup ||
    ruleDraft[k].roles.slice().sort().join(",") !== rules[k].roles.slice().sort().join(","),
  );

  const updateRule = (c: DigestCadence, patch: Partial<DigestRules[DigestCadence]>) =>
    setRuleDraft((d) => ({ ...d, [c]: { ...d[c], ...patch } }));

  const toggleRoleInRule = (c: DigestCadence, role: string) => {
    setRuleDraft((d) => {
      const has = d[c].roles.includes(role);
      return { ...d, [c]: { ...d[c], roles: has ? d[c].roles.filter((r) => r !== role) : [...d[c].roles, role] } };
    });
  };

  const handleSaveRules = async () => {
    const err = await saveRules(ruleDraft);
    if (err) return toast.error("Could not save rules", { description: err.message });
    toast.success("Recipient rules saved");
  };

  const applyRulesToSubscriptions = async () => {
    setApplying(true);
    try {
      let touched = 0;
      for (const u of users.filter((x) => x.status !== "inactive")) {
        const desired: Record<DigestCadence, boolean> = {
          daily:   ruleDraft.daily.enabled   && (ruleDraft.daily.roles.includes(u.role)   || (ruleDraft.daily.managerRollup   && MANAGER_ROLES.includes(u.role))),
          weekly:  ruleDraft.weekly.enabled  && (ruleDraft.weekly.roles.includes(u.role)  || (ruleDraft.weekly.managerRollup  && MANAGER_ROLES.includes(u.role))),
          monthly: ruleDraft.monthly.enabled && (ruleDraft.monthly.roles.includes(u.role) || (ruleDraft.monthly.managerRollup && MANAGER_ROLES.includes(u.role))),
        };
        const cur = subs.find((s) => s.app_user_id === u.id);
        if (!cur || cur.daily !== desired.daily || cur.weekly !== desired.weekly || cur.monthly !== desired.monthly) {
          await upsert(u.id, desired);
          touched++;
        }
      }
      await refetchSubs();
      toast.success("Rules applied", { description: `${touched} subscription(s) updated` });
    } catch (e) {
      toast.error("Apply failed", { description: e instanceof Error ? e.message : "Unknown" });
    } finally {
      setApplying(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-display">Team Digests</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Internal status emails — daily task lists for the team and weekly / monthly
              performance reports for managers. Configure schedules and recipient rules below.
            </p>
          </div>
        </div>

        <AutomationStatusCard />



        {/* Cadence schedules + recipient rules */}
        <Card>
          <CardHeader className="pb-3 flex-row items-start justify-between space-y-0 gap-4 flex-wrap">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" /> Cadence schedules &amp; recipient rules
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Enable each cadence and pick which roles receive it. Toggle <em>Manager rollup</em> to also
                include RCM Manager / Hospital Admin / CFO View / Super Admin on a performance summary.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" disabled={!ruleDirty || rulesSaving}
                onClick={() => setRuleDraft(rules)} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
              <Button size="sm" disabled={!ruleDirty || rulesSaving} onClick={handleSaveRules} className="gap-1.5">
                {rulesSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save rules
              </Button>
              <Button size="sm" variant="secondary" disabled={applying || usersLoading}
                onClick={applyRulesToSubscriptions} className="gap-1.5">
                {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
                Apply to subscribers
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CADENCES.map((c) => {
              const r = ruleDraft[c.id];
              const active = r.enabled && counts[c.id] > 0;
              return (
                <div key={c.id} className="rounded-lg border p-4 space-y-3 bg-card">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {counts[c.id]} subscriber{counts[c.id] === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Badge variant={active ? "default" : "outline"} className="text-[10px]">
                      {r.enabled ? (active ? "Active" : "Enabled") : "Off"}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span>Enable cadence</span>
                    <Switch checked={r.enabled} onCheckedChange={(v) => updateRule(c.id, { enabled: v })} />
                  </div>

                  <Separator />

                  <div>
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Roles that receive this digest
                    </Label>
                    <div className="mt-2 space-y-1.5">
                      {ROLES.map((role) => (
                        <label key={role} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox
                            checked={r.roles.includes(role)}
                            disabled={!r.enabled}
                            onCheckedChange={() => toggleRoleInRule(c.id, role)}
                          />
                          {role}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span title="Also include RCM Manager / Hospital Admin / CFO View / Super Admin">
                      Manager rollup
                    </span>
                    <Switch
                      checked={r.managerRollup}
                      disabled={!r.enabled}
                      onCheckedChange={(v) => updateRule(c.id, { managerRollup: v })}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Subscriptions table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Who receives digests?
            </CardTitle>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="py-6 flex items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading users…
              </div>
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No users yet. Add team members in Settings → Users.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3">User</th>
                      <th className="text-left py-2 pr-3">Role</th>
                      <th className="text-center py-2 px-3">Daily</th>
                      <th className="text-center py-2 px-3">Weekly</th>
                      <th className="text-center py-2 px-3">Monthly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter((u) => u.status !== "inactive").map((u) => {
                      const s = subFor(u.id);
                      return (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <div className="font-medium">{u.name}</div>
                            <div className="text-[11px] text-muted-foreground">{u.email}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                          </td>
                          <td className="text-center py-2 px-3">
                            <Switch checked={s?.daily ?? false}
                              onCheckedChange={(v) => handleToggle(u.id, "daily", v)} />
                          </td>
                          <td className="text-center py-2 px-3">
                            <Switch checked={s?.weekly ?? false}
                              onCheckedChange={(v) => handleToggle(u.id, "weekly", v)} />
                          </td>
                          <td className="text-center py-2 px-3">
                            <Switch checked={s?.monthly ?? false}
                              onCheckedChange={(v) => handleToggle(u.id, "monthly", v)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11px] text-muted-foreground mt-3 italic">
                  Suggested defaults — Daily: Billing Executives, Ops · Weekly &amp; Monthly:
                  CEO, CFO, RCM Manager, Ops Manager.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Templates editor */}
        <Card>
          <CardHeader className="pb-3 flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Editable digest templates
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Customize subject, body, and format per cadence. Tokens are auto-filled from live data.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!dirty || saving}
                onClick={() => setDraft(templates)} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </Button>
              <Button size="sm" disabled={!dirty || saving} onClick={handleSave} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save changes
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {tplLoading ? (
              <div className="py-6 flex items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
              </div>
            ) : (
              <Tabs value={tab} onValueChange={(v) => setTab(v as DigestCadence)}>
                <TabsList>
                  {CADENCES.map((c) => (
                    <TabsTrigger key={c.id} value={c.id}>{c.label}</TabsTrigger>
                  ))}
                </TabsList>
                {CADENCES.map((c) => {
                  const t = draft[c.id];
                  return (
                    <TabsContent key={c.id} value={c.id} className="space-y-4 pt-4">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Suggested for: <strong>{c.suggestedRoles}</strong></span>
                        <Button
                          size="sm" variant="outline" className="ml-auto h-7 gap-1.5"
                          onClick={() => sendNow(c.id)}
                          disabled={sending === c.id}
                        >
                          {sending === c.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Send className="h-3 w-3" />}
                          Send now to subscribers
                        </Button>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</Label>
                        <Input value={t.subject}
                          onChange={(e) => setDraft((d) => ({ ...d, [c.id]: { ...d[c.id], subject: e.target.value } }))}
                          className="h-9 text-sm font-mono" spellCheck={false} />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Format</Label>
                        <RadioGroup
                          value={t.format}
                          onValueChange={(v) => setDraft((d) => ({ ...d, [c.id]: { ...d[c.id], format: v as "html" | "text" } }))}
                          className="flex gap-4"
                        >
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <RadioGroupItem value="html" /> HTML (rich)
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <RadioGroupItem value="text" /> Plain text
                          </label>
                        </RadioGroup>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Body</Label>
                        <Textarea value={t.body} rows={14}
                          onChange={(e) => setDraft((d) => ({ ...d, [c.id]: { ...d[c.id], body: e.target.value } }))}
                          className="font-mono text-xs" spellCheck={false} />
                      </div>

                      <Separator />

                      <div>
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 block">
                          Available tokens
                        </Label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                          {DIGEST_TOKENS.map((tk) => (
                            <div key={tk.token} className="flex items-center gap-3 rounded border bg-muted/40 px-2.5 py-1.5">
                              <code className="text-[11px] font-mono bg-background border rounded px-1.5 py-0.5 shrink-0">{tk.token}</code>
                              <span className="text-[11px] text-muted-foreground">{tk.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

// --- Automation status card ---------------------------------------------------
// Shows the active pg_cron schedules (daily / weekly / monthly) and the most
// recent automated send results so admins know the report is going out without
// having to dig into the database.
function AutomationStatusCard() {
  const [runs, setRuns] = useState<Array<{ cadence: string; created_at: string; sent_count: number; failed_count: number; trigger_kind: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("team_digest_runs")
        .select("cadence,created_at,sent_count,failed_count,trigger_kind")
        .order("created_at", { ascending: false })
        .limit(10);
      setRuns((data ?? []) as never);
      setLoading(false);
    })();
  }, []);

  const schedules: Array<{ cadence: DigestCadence; cron: string; human: string }> = [
    { cadence: "daily",   cron: "0 3 * * 1-5", human: "Mon–Fri · 08:30 IST" },
    { cadence: "weekly",  cron: "30 3 * * 1",  human: "Every Monday · 09:00 IST" },
    { cadence: "monthly", cron: "30 3 1 * *",  human: "1st of every month · 09:00 IST" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" /> Automation status
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Reports are dispatched automatically by the scheduler — no manual action required.
          Times shown in IST.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {schedules.map((s) => {
            const last = runs.find((r) => r.cadence === s.cadence);
            return (
              <div key={s.cadence} className="rounded-lg border p-3 bg-card">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium capitalize">{s.cadence} report</div>
                  <Badge variant="default" className="text-[10px]">Scheduled</Badge>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{s.human}</div>
                <div className="text-[10px] text-muted-foreground mt-2 font-mono">cron: {s.cron}</div>
                {last ? (
                  <div className="text-[11px] mt-2">
                    Last run: {new Date(last.created_at).toLocaleString()} ·{" "}
                    <span className="text-emerald-600">{last.sent_count} sent</span>
                    {last.failed_count > 0 && <span className="text-red-600"> · {last.failed_count} failed</span>}
                  </div>
                ) : (
                  <div className="text-[11px] mt-2 text-muted-foreground">No runs yet — first run will appear after the schedule fires.</div>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">Recent automated runs</div>
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : runs.length === 0 ? (
            <div className="text-xs text-muted-foreground">No runs yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase text-muted-foreground">
                  <tr className="border-b"><th className="text-left py-1.5">When</th><th className="text-left">Cadence</th><th className="text-left">Trigger</th><th className="text-right">Sent</th><th className="text-right">Failed</th></tr>
                </thead>
                <tbody>
                  {runs.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="capitalize">{r.cadence}</td>
                      <td className="text-muted-foreground">{r.trigger_kind ?? "—"}</td>
                      <td className="text-right tabular-nums">{r.sent_count}</td>
                      <td className="text-right tabular-nums">{r.failed_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

