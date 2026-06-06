import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart, Legend } from "recharts";
import { AlertTriangle, ArrowUpRight, Sparkles, ShieldCheck, Wand2, ListChecks, TrendingUp, Loader2, FileText, Save } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useLiveClaims } from "@/hooks/useLiveClaims";
import { useDqRules } from "@/hooks/useDqRules";
import { mapToDenialCode, CATEGORY_COLORS } from "@/data/denialCodes";
import { DENIAL_ACTIONS, getActionForCode } from "@/data/denialActions";
import { getDenialRows, getDenialKpis, getCategoryStats } from "@/lib/denialAnalytics";
import { buildEscalationRow, bucketByTier, TIER_SLA_DAYS, type EscalationTier } from "@/lib/denialEscalation";
import { generatePreventionSuggestions, firstPassByMonth } from "@/lib/denialPrevention";
import { buildAppealDraft } from "@/lib/claimAppeal";
import { generateAiAppealLetter } from "@/lib/denialAiAppeal.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatInr, formatInrShort, type Claim } from "@/data/mockClaims";

const TIER_TONE: Record<EscalationTier, string> = {
  1: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  2: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
  3: "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400",
  4: "bg-destructive/10 text-destructive border-destructive/30",
};

export default function DenialWorkflowPage() {
  const { claims, loading } = useLiveClaims();
  const { rules, save: saveRules, saving } = useDqRules();
  const kpis = getDenialKpis(claims);
  const categories = getCategoryStats(claims);
  const denialRows = useMemo(() => getDenialRows(claims), [claims]);

  // ---------- Escalation matrix ----------
  const escalationRows = useMemo(
    () => denialRows.map((r) => buildEscalationRow(r.claim, r.shortPaid)),
    [denialRows],
  );
  const tiers = useMemo(() => bucketByTier(escalationRows), [escalationRows]);
  const promoteCount = escalationRows.filter((r) => r.should_promote).length;

  // ---------- Prevention loop ----------
  const suggestions = useMemo(() => generatePreventionSuggestions(claims), [claims]);
  const enabledRules: Record<string, boolean> = useMemo(
    () => ((rules as unknown as { prevention_rules?: Record<string, boolean> }).prevention_rules ?? {}),
    [rules],
  );
  const toggleRule = async (key: string, on: boolean) => {
    const nextPrev = { ...enabledRules, [key]: on };
    const next = { ...rules, prevention_rules: nextPrev } as typeof rules;
    const { error } = await saveRules(next);
    if (error) toast.error(`Failed to save: ${error.message}`);
    else toast.success(on ? "Rule enabled" : "Rule disabled");
  };

  // ---------- First-pass tracking ----------
  const fprr = useMemo(() => firstPassByMonth(claims, 6), [claims]);
  const fprrChart = fprr.map((p) => ({ ...p, ratePct: +(p.rate * 100).toFixed(1) }));

  // ---------- Action plans ----------
  const codeUsage = useMemo(() => {
    const m = new Map<string, { count: number; amount: number }>();
    for (const r of denialRows) {
      const cur = m.get(r.code.code) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.shortPaid;
      m.set(r.code.code, cur);
    }
    return m;
  }, [denialRows]);

  // ---------- AI Appeal generator ----------
  const [appealClaim, setAppealClaim] = useState<Claim | null>(null);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-foreground">Denial Management Workflow</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Root-cause taxonomy · AI appeal drafts · escalation matrix · prevention loop
            </p>
          </div>
        </div>

        <KpiGrid cols={5}>
          <KpiCard label="Open Denials" value={String(denialRows.length)} loading={loading}
            icon={<AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
            caption={<span className="truncate">{formatInr(kpis.amountAtRisk)} at risk</span>} />
          <KpiCard label="First-Pass Rate" value={`${(kpis.firstPassRate * 100).toFixed(1)}%`} loading={loading}
            icon={<ShieldCheck className="h-3.5 w-3.5 text-accent" />}
            caption={<span className="truncate">Settled without query/denial</span>} />
          <KpiCard label="Needs Escalation" value={String(promoteCount)} loading={loading}
            icon={<ArrowUpRight className="h-3.5 w-3.5 text-warning" />}
            caption={<span className="truncate">Past tier SLA</span>} />
          <KpiCard label="Prevention Rules" value={`${Object.values(enabledRules).filter(Boolean).length}/${suggestions.length}`}
            loading={loading} icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
            caption={<span className="truncate">Active scrubber checks</span>} />
          <KpiCard label="Recoverable" value={formatInr(kpis.recoverable)} loading={loading}
            icon={<TrendingUp className="h-3.5 w-3.5 text-accent" />}
            caption={<span className="truncate">Weighted by recovery %</span>} />
        </KpiGrid>

        <Tabs defaultValue="actions" className="w-full">
          <TabsList>
            <TabsTrigger value="actions"><ListChecks className="h-3.5 w-3.5 mr-1.5" />Action Plans</TabsTrigger>
            <TabsTrigger value="appeals"><Wand2 className="h-3.5 w-3.5 mr-1.5" />AI Appeals</TabsTrigger>
            <TabsTrigger value="fprr"><ShieldCheck className="h-3.5 w-3.5 mr-1.5" />First-Pass</TabsTrigger>
            <TabsTrigger value="prevention"><Sparkles className="h-3.5 w-3.5 mr-1.5" />Prevention Loop</TabsTrigger>
            <TabsTrigger value="escalation"><ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />Escalation</TabsTrigger>
          </TabsList>

          {/* ===== ACTION PLANS ===== */}
          <TabsContent value="actions" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Corrective action templates by denial code</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {Object.values(DENIAL_ACTIONS).map((a) => {
                  const usage = codeUsage.get(a.code);
                  return (
                    <div key={a.code} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-[10px]">{a.code}</Badge>
                          <span className="text-xs font-medium">{a.root_cause}</span>
                        </div>
                        {usage && (
                          <Badge className="text-[10px] tabular-nums">
                            {usage.count} · {formatInrShort(usage.amount)}
                          </Badge>
                        )}
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Recover now</div>
                        <ul className="text-xs space-y-0.5 mt-1 list-decimal list-inside">
                          {a.corrective.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Appeal angle</div>
                        <p className="text-xs italic mt-0.5">{a.appeal_angle}</p>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                        <span>Escalate to: <span className="font-medium text-foreground">{a.escalation_to}</span></span>
                        {a.scrubber_rule && (
                          <Badge variant="secondary" className="text-[10px]">
                            scrubber: {a.scrubber_rule}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== AI APPEALS ===== */}
          <TabsContent value="appeals" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Generate payer-specific appeal letter (AI-assisted)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-3">
                  Pick a denied claim. The base template is built from your denial taxonomy; AI rewrites it
                  in the payer's tone with the strongest appeal angle. Review &amp; edit before approving.
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                  <div className="lg:col-span-4 max-h-[520px] overflow-auto border rounded-md">
                    <Table dense>
                      <TableHeader sticky>
                        <TableRow>
                          <TableHead>Claim</TableHead>
                          <TableHead align="right">Short Paid</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {denialRows.slice(0, 200).map(({ claim, shortPaid }) => (
                          <TableRow
                            key={claim.id}
                            className={`cursor-pointer ${appealClaim?.id === claim.id ? "bg-primary/5" : ""}`}
                            onClick={() => setAppealClaim(claim)}
                          >
                            <TableCell>
                              <div className="text-xs font-medium">{claim.patient_name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {claim.claim_number} · {claim.tpa_name}
                              </div>
                            </TableCell>
                            <TableCell numeric className="text-xs">{formatInrShort(shortPaid)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="lg:col-span-8">
                    {appealClaim
                      ? <AppealEditor claim={appealClaim} />
                      : <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
                          Select a denied claim from the list to draft an appeal.
                        </div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== FIRST-PASS ===== */}
          <TabsContent value="fprr" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">First-pass resolution rate — last 6 months</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={fprrChart} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="r" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                    <YAxis yAxisId="c" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="c" dataKey="total" name="Claims" fill="hsl(220,30%,75%)" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="c" dataKey="first_pass" name="First-pass" fill="hsl(170,60%,40%)" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="r" type="monotone" dataKey="ratePct" name="FPRR %" stroke="hsl(0,70%,45%)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">FPRR by category — recovery outlook</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {categories.map((c) => (
                    <div key={c.category} className="border rounded-md p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c.category] }} />
                        <span className="text-xs font-medium">{c.category}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">{c.count} denials · {formatInr(c.amountAtRisk)}</div>
                      <Progress value={c.avgRecoveryRate * 100} className="h-1.5 mt-2" />
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {(c.avgRecoveryRate * 100).toFixed(0)}% est. recovery on appeal
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== PREVENTION LOOP ===== */}
          <TabsContent value="prevention" className="space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Prevention loop — enable scrubber rules derived from your denials
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-3">
                  Each suggestion is ranked by ₹ that would have been protected if the rule were active
                  during the period. Enabling persists into Data Quality rules.
                </div>
                {suggestions.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center">
                    No actionable patterns yet — keep importing claims and check back.
                  </div>
                ) : (
                  <Table dense>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rule</TableHead>
                        <TableHead align="right">Denials</TableHead>
                        <TableHead align="right">₹ Protected</TableHead>
                        <TableHead align="right">Confidence</TableHead>
                        <TableHead align="right">Enable</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suggestions.map((s) => (
                        <TableRow key={s.rule_key}>
                          <TableCell>
                            <div className="text-xs font-medium">{s.title}</div>
                            <div className="text-[10px] text-muted-foreground">{s.description}</div>
                            {s.sample_claims.length > 0 && (
                              <div className="text-[10px] text-muted-foreground mt-1">
                                e.g. {s.sample_claims.join(", ")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell numeric className="text-xs">{s.denial_count}</TableCell>
                          <TableCell numeric className="text-xs font-medium">{formatInr(s.amount_prevented)}</TableCell>
                          <TableCell numeric className="text-xs">{(s.confidence * 100).toFixed(0)}%</TableCell>
                          <TableCell align="right">
                            <Switch
                              checked={!!enabledRules[s.rule_key]}
                              disabled={saving}
                              onCheckedChange={(v) => toggleRule(s.rule_key, v)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ESCALATION MATRIX ===== */}
          <TabsContent value="escalation" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {tiers.map((b) => (
                <Card key={b.tier} className="shadow-sm">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className={`text-[10px] ${TIER_TONE[b.tier]}`}>
                        Tier {b.tier}
                      </Badge>
                      {b.promote_count > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {b.promote_count} past SLA
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs font-semibold mt-1">{b.owner}</div>
                    <div className="text-[10px] text-muted-foreground">SLA {TIER_SLA_DAYS[b.tier]}d</div>
                    <div className="text-lg font-bold tabular-nums mt-1">{b.count}</div>
                    <div className="text-[10px] text-muted-foreground">{formatInr(b.amount)} at risk</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Escalation queue — claims past tier SLA</CardTitle>
              </CardHeader>
              <CardContent>
                <Table dense>
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead>Tier</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Claim</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead align="right">Short Paid</TableHead>
                      <TableHead align="right">Age</TableHead>
                      <TableHead align="right">Days in tier</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {escalationRows
                      .filter((r) => r.should_promote)
                      .sort((a, b) => b.shortPaid - a.shortPaid)
                      .slice(0, 50)
                      .map((r) => (
                        <TableRow key={r.claim.id}>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${TIER_TONE[r.tier]}`}>T{r.tier}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{r.owner}</TableCell>
                          <TableCell>
                            <div className="text-xs font-medium">{r.claim.patient_name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {r.claim.claim_number} · {r.claim.tpa_name}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs max-w-[260px] truncate">{r.reason}</TableCell>
                          <TableCell numeric className="text-xs font-medium">{formatInr(r.shortPaid)}</TableCell>
                          <TableCell numeric className="text-xs">{r.age}d</TableCell>
                          <TableCell numeric className="text-xs">
                            <Badge variant="destructive" className="text-[10px] tabular-nums">
                              {r.days_in_tier}d
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    {promoteCount === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          Nothing past SLA — escalation queue is clear.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// ============================================================
// Appeal editor — base template + AI rewrite + save to claim_appeals
// ============================================================
function AppealEditor({ claim }: { claim: Claim }) {
  const aiGen = useServerFn(generateAiAppealLetter);
  const code = mapToDenialCode(claim.claim_status, claim.insurer_comments);
  const action = getActionForCode(code);

  const baseDraft = useMemo(() => {
    return buildAppealDraft(
      {
        ...claim,
        approved_amount: claim.approved_amount,
        settled_amount: claim.settled_amount,
        tds_amount: claim.tds_amount,
      },
      {
        discrepancy_min_inr: 1,
        discrepancy_min_pct: 0,
        discrepancy_low_pct: 5,
        discrepancy_high_pct: 15,
      },
    );
  }, [claim]);

  const [subject, setSubject] = useState(baseDraft?.subject ?? `Appeal — Claim ${claim.claim_number}`);
  const [body, setBody] = useState(baseDraft?.body ?? "");
  const [tone, setTone] = useState<"formal" | "firm" | "conciliatory">("formal");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const runAi = async () => {
    setAiLoading(true);
    try {
      const res = await aiGen({
        data: {
          claimId: claim.id,
          baseSubject: subject,
          baseBody: body || `Appeal for claim ${claim.claim_number} short paid by ${formatInr(claim.shortfall_amount)}.`,
          payer: claim.tpa_name || claim.insurance_company_name || "Payer",
          denialCode: code?.code,
          appealAngle: action?.appeal_angle,
          tone,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "AI generation failed");
      } else {
        if (res.subject) setSubject(res.subject);
        if (res.body) setBody(res.body);
        toast.success("AI draft ready — review and save");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI call failed");
    } finally {
      setAiLoading(false);
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    const payload = {
      claim_id: claim.id,
      subject,
      body,
      gap_amount: baseDraft?.gap_amount ?? 0,
      gap_pct: baseDraft?.gap_pct ?? 0,
      band: baseDraft?.band ?? null,
      status: "draft",
      generated_by: "ai",
    };
    const { error } = await supabase.from("claim_appeals").insert(payload as never);
    setSaving(false);
    if (error) toast.error(`Save failed: ${error.message}`);
    else toast.success("Appeal draft saved");
  };

  return (
    <div className="border rounded-md p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="font-mono text-[10px]">{claim.claim_number}</Badge>
        <span className="font-medium">{claim.patient_name}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{claim.tpa_name}</span>
        {code && <Badge variant="secondary" className="text-[10px]">{code.code}</Badge>}
      </div>
      {action && (
        <div className="rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Lead argument: </span>{action.appeal_angle}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Tone:</span>
        {(["formal", "firm", "conciliatory"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tone === t ? "default" : "outline"}
            className="h-7 text-[11px] capitalize"
            onClick={() => setTone(t)}
          >
            {t}
          </Button>
        ))}
        <Button size="sm" className="h-7 ml-auto gap-1" onClick={runAi} disabled={aiLoading}>
          {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          AI rewrite
        </Button>
      </div>
      <div>
        <label className="text-[10px] uppercase text-muted-foreground tracking-wide">Subject</label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="text-xs mt-1" />
      </div>
      <div>
        <label className="text-[10px] uppercase text-muted-foreground tracking-wide">Body</label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className="text-xs mt-1 font-mono"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" className="gap-1" onClick={() => {
          navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
          toast.success("Copied to clipboard");
        }}>
          <FileText className="h-3.5 w-3.5" /> Copy
        </Button>
        <Button size="sm" className="gap-1" onClick={saveDraft} disabled={saving || !body.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save draft
        </Button>
      </div>
    </div>
  );
}
