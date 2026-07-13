import { useCallback, useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Gavel, Loader2, ChevronDown, FileText, Sparkles, Building2, RefreshCw, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { mapToDenialCode } from "@/data/denialCodes";
import { getActionForCode } from "@/data/denialActions";
import { insurerProfiles } from "@/data/insurerProfiles";
import { formatInr, formatInrShort, type Claim } from "@/data/mockClaims";
import {
  getChecklist, setChecklistItem, getProgressMap, type ChecklistItem,
} from "@/lib/appealChecklist";

type AppealStatus = "draft" | "submitted" | "accepted" | "rejected";

interface AppealRow {
  id: string;
  claim_id: string;
  subject: string;
  body: string;
  status: string;
  gap_amount: number;
  gap_pct: number;
  band: string | null;
  generated_by: string;
  recipient_email: string | null;
  recipient_name: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_ORDER: AppealStatus[] = ["draft", "submitted", "accepted", "rejected"];

const STATUS_TONE: Record<AppealStatus, string> = {
  draft: "bg-muted text-foreground border-border",
  submitted: "bg-primary/10 text-primary border-primary/30",
  accepted: "bg-success/15 text-success border-success/40",
  rejected: "bg-destructive/15 text-destructive border-destructive/40",
};

function normalizeStatus(s: string): AppealStatus {
  const t = (s || "").toLowerCase().trim();
  if (t === "submitted" || t === "sent") return "submitted";
  if (t === "accepted" || t === "approved" || t === "won") return "accepted";
  if (t === "rejected" || t === "denied" || t === "lost") return "rejected";
  return "draft";
}

export default function AppealsTrackerPage() {
  const { claims } = useLiveClaims();
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<AppealStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AppealRow | null>(null);
  const [checklistTick, setChecklistTick] = useState(0);
  const bumpChecklist = useCallback(() => setChecklistTick((n) => n + 1), []);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("claim_appeals")
      .select("id,claim_id,subject,body,status,gap_amount,gap_pct,band,generated_by,recipient_email,recipient_name,sent_at,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(500);
    setLoading(false);
    if (error) { toast.error(`Load failed: ${error.message}`); return; }
    setAppeals((data ?? []) as AppealRow[]);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Index claims by id for quick lookup.
  const claimById = useMemo(() => {
    const m = new Map<string, Claim>();
    for (const c of claims) m.set(c.id, c);
    return m;
  }, [claims]);

  // KPI counts.
  const counts = useMemo(() => {
    const c = { draft: 0, submitted: 0, accepted: 0, rejected: 0, gap: 0 };
    for (const a of appeals) {
      c[normalizeStatus(a.status)] += 1;
      c.gap += a.gap_amount || 0;
    }
    return c;
  }, [appeals]);

  const winRate = counts.accepted + counts.rejected > 0
    ? (counts.accepted / (counts.accepted + counts.rejected)) * 100
    : 0;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appeals
      .filter((a) => filter === "all" || normalizeStatus(a.status) === filter)
      .filter((a) => {
        if (!q) return true;
        const c = claimById.get(a.claim_id);
        return (
          a.subject.toLowerCase().includes(q) ||
          (c?.patient_name || "").toLowerCase().includes(q) ||
          (c?.claim_number || "").toLowerCase().includes(q) ||
          (c?.tpa_name || "").toLowerCase().includes(q)
        );
      });
  }, [appeals, filter, search, claimById]);

  // Progress across all currently visible appeals (recomputed when checklists change).
  const progressMap = useMemo(
    () => getProgressMap(rows.map((a) => a.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, checklistTick],
  );
  const checklistTotals = useMemo(() => {
    let done = 0, total = 0;
    for (const id of Object.keys(progressMap)) {
      done += progressMap[id].done;
      total += progressMap[id].total;
    }
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [progressMap]);


  const setStatus = async (id: string, next: AppealStatus) => {
    const patch: Partial<AppealRow> = { status: next };
    if (next === "submitted") patch.sent_at = new Date().toISOString();
    const { error } = await supabase
      .from("claim_appeals")
      .update(patch as never)
      .eq("id", id);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    setAppeals((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch, updated_at: new Date().toISOString() } as AppealRow : a)),
    );
    toast.success(`Moved to ${next}`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground">Appeals Tracker</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track every appeal draft from creation to outcome. Payer-specific next actions on each row.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>

        <KpiGrid cols={6}>
          <KpiCard label="Drafts" value={String(counts.draft)} loading={loading}
            icon={<FileText className="h-3.5 w-3.5 text-muted-foreground" />} />
          <KpiCard label="Submitted" value={String(counts.submitted)} loading={loading}
            icon={<Gavel className="h-3.5 w-3.5 text-primary" />} />
          <KpiCard label="Accepted" value={String(counts.accepted)} loading={loading}
            icon={<Sparkles className="h-3.5 w-3.5 text-success" />} />
          <KpiCard label="Rejected" value={String(counts.rejected)} loading={loading}
            icon={<Gavel className="h-3.5 w-3.5 text-destructive" />} />
          <KpiCard label="Win rate" value={`${winRate.toFixed(0)}%`} loading={loading}
            icon={<Sparkles className="h-3.5 w-3.5 text-accent" />}
            caption={<span className="truncate">{formatInrShort(counts.gap)} short-paid tracked</span>} />
          <KpiCard label="Actions done" value={`${checklistTotals.pct}%`} loading={loading}
            icon={<ListChecks className="h-3.5 w-3.5 text-primary" />}
            caption={<span className="truncate">{checklistTotals.done}/{checklistTotals.total} steps checked</span>} />
        </KpiGrid>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">Appeals</CardTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button size="sm" variant={filter === "all" ? "default" : "outline"} className="h-7 text-[11px]"
                  onClick={() => setFilter("all")}>All</Button>
                {STATUS_ORDER.map((s) => (
                  <Button key={s} size="sm"
                    variant={filter === s ? "default" : "outline"}
                    className="h-7 text-[11px] capitalize"
                    onClick={() => setFilter(s)}>{s}</Button>
                ))}
                <div className="mx-2 h-5 w-px bg-border" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search claim / patient / payer…"
                  className="h-7 text-xs w-60" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {loading ? "Loading…" : "No appeals match this filter. Draft one from the Denial Workflow → AI Appeals tab."}
              </div>
            ) : (
              <Table dense>
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Claim / Patient</TableHead>
                    <TableHead>Payer</TableHead>
                    <TableHead>Denial code</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead align="right">Gap</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead align="right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((a) => {
                    const claim = claimById.get(a.claim_id);
                    const code = claim ? mapToDenialCode(claim.claim_status, claim.insurer_comments) : null;
                    const status = normalizeStatus(a.status);
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] capitalize ${STATUS_TONE[status]}`}>
                            {status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">{claim?.patient_name ?? "—"}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {claim?.claim_number ?? a.claim_id.slice(0, 8)}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{claim?.tpa_name ?? "—"}</TableCell>
                        <TableCell>
                          {code
                            ? <Badge variant="secondary" className="text-[10px] font-mono">{code.code}</Badge>
                            : <span className="text-[11px] text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell numeric className="text-xs font-medium">
                          {formatInr(a.gap_amount)}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {new Date(a.updated_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell align="right">
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                              onClick={() => setEditing(a)}>
                              Open
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                                  Move <ChevronDown className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {STATUS_ORDER.filter((s) => s !== status).map((s) => (
                                  <DropdownMenuItem key={s} className="text-xs capitalize"
                                    onClick={() => setStatus(a.id, s)}>
                                    {s}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AppealDetailDialog
        appeal={editing}
        claim={editing ? claimById.get(editing.claim_id) ?? null : null}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
    </AppLayout>
  );
}

// ============================================================
// Detail dialog — edit body/subject and see payer-specific next actions
// ============================================================
function AppealDetailDialog({
  appeal, claim, onClose, onSaved,
}: {
  appeal: AppealRow | null;
  claim: Claim | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appeal) { setSubject(appeal.subject); setBody(appeal.body); }
  }, [appeal]);

  const payerName = claim?.tpa_name || claim?.insurance_company_name || "";
  const profile = useMemo(() => {
    if (!payerName) return null;
    const needle = payerName.toLowerCase();
    return insurerProfiles.find(
      (p) => needle.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(needle),
    ) ?? null;
  }, [payerName]);

  const code = claim ? mapToDenialCode(claim.claim_status, claim.insurer_comments) : null;
  const action = getActionForCode(code);

  const save = async () => {
    if (!appeal) return;
    setSaving(true);
    const { error } = await supabase
      .from("claim_appeals")
      .update({ subject, body } as never)
      .eq("id", appeal.id);
    setSaving(false);
    if (error) { toast.error(`Save failed: ${error.message}`); return; }
    toast.success("Saved");
    onSaved();
    onClose();
  };

  if (!appeal) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Appeal — {claim?.patient_name ?? "Unknown patient"}
            <Badge variant="secondary" className="font-mono text-[10px]">
              {claim?.claim_number ?? appeal.claim_id.slice(0, 8)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 overflow-y-auto pr-1">
          <div className="lg:col-span-2 space-y-3">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wide">Subject</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-xs mt-1" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wide">Body</label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)}
                rows={18} className="text-xs mt-1 font-mono" />
            </div>
          </div>

          <div className="space-y-3">
            {/* Payer-specific next actions */}
            <Card className="shadow-none border-primary/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  Payer-specific next actions
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] space-y-2">
                <div className="font-medium">{payerName || "Payer unknown"}</div>
                {profile ? (
                  <>
                    <div className="text-muted-foreground">
                      Committed payment TAT: <span className="font-medium text-foreground">{profile.paymentTat}d</span>
                    </div>
                    <div className="text-muted-foreground">
                      Preferred submission: <span className="font-medium text-foreground">{profile.submissionMode}</span>
                    </div>
                    {profile.escalationMatrix?.[0] && (
                      <div className="border-t pt-2">
                        <div className="font-semibold text-foreground">Escalate to {profile.escalationMatrix[0].level}</div>
                        <div>{profile.escalationMatrix[0].name} · {profile.escalationMatrix[0].designation}</div>
                        <div className="font-mono">{profile.escalationMatrix[0].email}</div>
                        <div className="font-mono">{profile.escalationMatrix[0].phone}</div>
                        <div className="text-muted-foreground mt-1">
                          Response SLA: {profile.escalationMatrix[0].responseHours}h
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    Add a profile in TPA / Insurers to unlock payer SLA and escalation contacts.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Denial-code playbook */}
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                  Playbook for denial code
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] space-y-2">
                {code && action ? (
                  <>
                    <Badge variant="outline" className="font-mono text-[10px]">{code.code}</Badge>
                    <div className="italic">{action.appeal_angle}</div>
                    <ol className="list-decimal list-inside space-y-0.5">
                      {action.corrective.slice(0, 4).map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                    <div className="text-muted-foreground border-t pt-1">
                      Escalate to: <span className="font-medium text-foreground">{action.escalation_to}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    No denial code mapped — check the source claim's status &amp; insurer comments.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
