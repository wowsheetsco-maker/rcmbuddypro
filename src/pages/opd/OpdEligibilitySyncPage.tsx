import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Zap, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";

interface Corporate { id: string; name: string; aggregator: string | null }
interface LogRow {
  id: string; aggregator: string | null; status: string;
  employees_synced: number; employees_activated: number;
  triggered_by: string | null; started_at: string; completed_at: string | null;
  error_message: string | null; corporate_id: string | null;
}

export default function OpdEligibilitySyncPage() {
  const [corps, setCorps] = useState<Corporate[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [corpId, setCorpId] = useState<string>("");
  const [busy, setBusy] = useState<"" | "sync" | "activate">("");

  const load = async () => {
    const [c, l] = await Promise.all([
      supabase.from("opd_corporates").select("id,name,aggregator").eq("is_active", true).order("name"),
      supabase.from("opd_eligibility_sync_log").select("*").order("started_at", { ascending: false }).limit(50),
    ]);
    setCorps((c.data ?? []) as Corporate[]);
    setLogs((l.data ?? []) as LogRow[]);
  };
  useEffect(() => { load(); }, []);

  const corpMap = new Map(corps.map((c) => [c.id, c]));

  /**
   * Manual sync: marks all employees of a corporate as eligibility-synced now.
   * Persists an audit row in opd_eligibility_sync_log capturing the run.
   * Phase-5 stub for aggregator API integration — call signature stays the same.
   */
  const runSync = async () => {
    if (!corpId) return toast({ title: "Pick a corporate", variant: "destructive" });
    const corp = corpMap.get(corpId);
    setBusy("sync");
    const orgId = getCurrentOrgId();

    const { data: logRow, error: logErr } = await supabase.from("opd_eligibility_sync_log").insert({
      org_id: orgId, corporate_id: corpId, aggregator: corp?.aggregator ?? null,
      triggered_by: "manual", status: "pending",
    }).select("id").single();
    if (logErr || !logRow) { setBusy(""); return toast({ title: "Could not start sync", description: logErr?.message, variant: "destructive" }); }

    try {
      const { data: emps } = await supabase.from("opd_employees").select("id").eq("corporate_id", corpId);
      const ids = (emps ?? []).map((e) => e.id);
      if (ids.length) {
        const { error: upErr } = await supabase.from("opd_employees").update({ eligibility_synced_at: new Date().toISOString() }).in("id", ids);
        if (upErr) throw upErr;
      }
      await supabase.from("opd_eligibility_sync_log").update({
        status: "success", employees_synced: ids.length, completed_at: new Date().toISOString(),
        details: { mode: "manual_stub" },
      }).eq("id", logRow.id);
      toast({ title: `Synced ${ids.length} employees`, description: "You can now activate eligibility rules." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("opd_eligibility_sync_log").update({
        status: "failed", error_message: msg, completed_at: new Date().toISOString(),
      }).eq("id", logRow.id);
      toast({ title: "Sync failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(""); load();
    }
  };

  /**
   * Activate eligibility rules after sync: marks expired employees inactive (wallet=0)
   * for the most recent successful sync of the chosen corporate. Audited in the log.
   */
  const activateRules = async () => {
    if (!corpId) return toast({ title: "Pick a corporate", variant: "destructive" });
    const lastSync = logs.find((l) => l.corporate_id === corpId && l.status === "success");
    if (!lastSync) return toast({ title: "No successful sync to activate", variant: "destructive" });
    setBusy("activate");
    const orgId = getCurrentOrgId();

    const { data: logRow } = await supabase.from("opd_eligibility_sync_log").insert({
      org_id: orgId, corporate_id: corpId, aggregator: corpMap.get(corpId)?.aggregator ?? null,
      triggered_by: "activation", status: "pending",
    }).select("id").single();

    try {
      const today = new Date().toISOString().slice(0, 10);
      // Rule 1: zero out wallet for expired employees so they cannot be used at capture.
      const { data: expired } = await supabase.from("opd_employees")
        .select("id").eq("corporate_id", corpId).lt("valid_to", today);
      const expiredIds = (expired ?? []).map((e) => e.id);
      if (expiredIds.length) {
        await supabase.from("opd_employees").update({ wallet_balance: 0 }).in("id", expiredIds);
      }
      await supabase.from("opd_eligibility_sync_log").update({
        status: "success", employees_activated: expiredIds.length, completed_at: new Date().toISOString(),
        details: { mode: "activate_rules", expired_zeroed: expiredIds.length, source_sync_id: lastSync.id },
      }).eq("id", logRow!.id);
      toast({ title: `Activated rules`, description: `Zeroed wallet for ${expiredIds.length} expired employee(s).` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("opd_eligibility_sync_log").update({
        status: "failed", error_message: msg, completed_at: new Date().toISOString(),
      }).eq("id", logRow!.id);
      toast({ title: "Activation failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(""); load();
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">Aggregator eligibility sync</h1>
          <p className="text-sm text-muted-foreground">Manual sync stub + audit log. Activate rules after sync to enforce expiry and wallet caps.</p>
        </header>

        <Card>
          <CardHeader><CardTitle className="text-base">Run a sync</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs text-muted-foreground">Corporate</label>
              <Select value={corpId} onValueChange={setCorpId}>
                <SelectTrigger><SelectValue placeholder="Select corporate" /></SelectTrigger>
                <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.aggregator ? ` · ${c.aggregator}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={!!busy} onClick={runSync}>
              <RefreshCw className="h-4 w-4 mr-1" /> {busy === "sync" ? "Syncing…" : "Sync eligibility"}
            </Button>
            <Button disabled={!!busy} onClick={activateRules}>
              <Zap className="h-4 w-4 mr-1" /> {busy === "activate" ? "Activating…" : "Activate rules"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Audit log ({logs.length})</CardTitle></CardHeader>
          <CardContent>
            {logs.length === 0
              ? <div className="text-sm text-muted-foreground py-6 text-center">No sync runs yet.</div>
              : <div className="overflow-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Started</TableHead><TableHead>Corporate</TableHead><TableHead>Trigger</TableHead>
                      <TableHead>Status</TableHead><TableHead className="text-right">Synced</TableHead>
                      <TableHead className="text-right">Activated</TableHead><TableHead>Notes</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {logs.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs">{new Date(l.started_at).toLocaleString()}</TableCell>
                          <TableCell>{l.corporate_id ? corpMap.get(l.corporate_id)?.name ?? "—" : "—"}</TableCell>
                          <TableCell className="text-xs">{l.triggered_by ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant={l.status === "success" ? "default" : l.status === "failed" ? "destructive" : "secondary"}>{l.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{l.employees_synced}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.employees_activated}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{l.error_message ?? (l.completed_at ? `done ${new Date(l.completed_at).toLocaleTimeString()}` : "")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
            }
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
