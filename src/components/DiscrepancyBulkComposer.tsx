// Bulk discrepancy composer — group selected discrepant claims by TPA and
// send ONE consolidated email per TPA with an attached XLSX of all the
// short-payment cases. Mirrors the screenshot's "Email + Excel" header
// button. Reuses send-discrepancy-bulk edge function.

import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Loader2, Send, Sparkles, FileSpreadsheet, Users, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getActingUserId } from "@/hooks/useActingUser";
import { inrShort, type DiscrepancyMetrics } from "@/lib/discrepancy";
import {
  findContactForProvider, type InsurerContactRow,
} from "@/hooks/useInsurerContacts";
import type { Claim } from "@/data/mockClaims";

type Tone = "formal" | "urgent" | "irdai" | "friendly";

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: "formal",   label: "Formal Reminder" },
  { value: "urgent",   label: "Urgent Escalation" },
  { value: "irdai",    label: "SLA Notice" },
  { value: "friendly", label: "Friendly" },
];

export interface DiscrepancyBulkRow {
  claim: Claim;
  metrics: DiscrepancyMetrics;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: DiscrepancyBulkRow[];
  contacts: InsurerContactRow[];
  hospitalName?: string;
  onSent?: () => void;
}

interface TpaGroup {
  tpa: string;
  rows: DiscrepancyBulkRow[];
  totalAmount: number;
  contact?: InsurerContactRow;
  recipient: string;
  cc: string;
  subject: string;
  body: string;
}

function defaultGroupBody(g: TpaGroup, hospital: string, tone: Tone): string {
  const total = inrShort(g.totalAmount);
  const count = g.rows.length;
  const opener = tone === "urgent"
    ? `⚠️  URGENT — ${count} short-paid claims pending reconciliation\n\n${hospital} has identified ${count} claim(s) with discrepancies in settlement, totalling ${total}. Please find the consolidated list attached.`
    : tone === "irdai"
      ? `Sub: Consolidated discrepancy notice — ${count} claim(s)\n\nUnder SLA (Health Insurance) Regulations 2016, please find attached the list of ${count} claim(s) where the settled amount falls short of the approved amount by ${total}.`
      : tone === "friendly"
        ? `Hi team,\n\nHope you're doing well. We've put together a quick list of ${count} claim(s) where we noticed a small short-payment (totalling ${total}). The full breakdown is attached as Excel.`
        : `Dear Sir/Madam,\n\nGreetings from ${hospital}.\n\nWe wish to bring to your attention ${count} claim(s) where the settled amount differs from the approved amount, with a total discrepancy of ${total}. The complete claim-wise breakdown is attached as an Excel sheet for your reference.`;

  return `${opener}\n\n────────────────────────────────────\nSUMMARY\n────────────────────────────────────\nTotal Claims         : ${count}\nTotal Discrepancy    : ${total}\nTPA / Insurer        : ${g.tpa}\n\nThe attached Excel contains claim number, patient name, approved amount, settled amount, TDS, discrepancy, and severity band for each case.\n\nKindly review and process the short-paid amounts at the earliest. Please share the UTR / payment acknowledgements once processed.\n\nThanks & Regards,\nBilling & Reconciliation Team\n${hospital}`;
}

function buildGroups(
  rows: DiscrepancyBulkRow[],
  contacts: InsurerContactRow[],
  hospital: string,
  tone: Tone,
): TpaGroup[] {
  const map = new Map<string, DiscrepancyBulkRow[]>();
  for (const r of rows) {
    const key = (r.claim.tpa_name || "Unknown TPA").trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries()).map(([tpa, rs]) => {
    const totalAmount = rs.reduce((s, x) => s + x.metrics.amount, 0);
    const contact = findContactForProvider(contacts, tpa);
    const g: TpaGroup = {
      tpa,
      rows: rs,
      totalAmount,
      contact,
      recipient: contact?.email ?? "claims@tpa.com",
      cc: contact?.cc_emails ?? "rcmhead@hospital.com",
      subject: `Consolidated Discrepancy Notice — ${rs.length} claim(s) | ${hospital}`,
      body: "",
    };
    g.body = defaultGroupBody(g, hospital, tone);
    return g;
  });
}

export default function DiscrepancyBulkComposer({
  open, onOpenChange, rows, contacts, hospitalName, onSent,
}: Props) {
  const hospital = hospitalName || rows[0]?.claim.hospital_name || "My Hospital";
  const [tone, setTone] = useState<Tone>("formal");
  const [groups, setGroups] = useState<TpaGroup[]>([]);
  const [activeTpa, setActiveTpa] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [aiBusyTpa, setAiBusyTpa] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const next = buildGroups(rows, contacts, hospital, tone);
    setGroups(next);
    if (next.length > 0 && !next.find((g) => g.tpa === activeTpa)) {
      setActiveTpa(next[0].tpa);
    }
  }, [open, rows, contacts, hospital]);

  useEffect(() => {
    setGroups((prev) =>
      prev.map((g) => ({ ...g, body: defaultGroupBody(g, hospital, tone) })),
    );
  }, [tone]);

  const totals = useMemo(() => {
    return {
      tpaCount: groups.length,
      claimCount: groups.reduce((s, g) => s + g.rows.length, 0),
      amount: groups.reduce((s, g) => s + g.totalAmount, 0),
    };
  }, [groups]);

  const updateGroup = (tpa: string, patch: Partial<TpaGroup>) => {
    setGroups((prev) => prev.map((g) => (g.tpa === tpa ? { ...g, ...patch } : g)));
  };

  const aiEnhanceGroup = async (g: TpaGroup) => {
    setAiBusyTpa(g.tpa);
    try {
      const { data, error } = await supabase.functions.invoke("ai-enhance-followup", {
        body: {
          tone,
          format: "text",
          insurerName: g.tpa,
          hospitalName: hospital,
          claimCount: g.rows.length,
          totalOutstanding: g.totalAmount,
          oldestDays: Math.max(...g.rows.map((r) => r.claim.days_since_claim ?? 0), 0),
          breachCount: g.rows.filter((r) => r.claim.is_irdai_breach).length,
          currentBody: g.body,
          mode: "enhance",
          claims: g.rows.slice(0, 20).map((r) => ({
            claim_number: r.claim.claim_number,
            patient_name: r.claim.patient_name,
            outstanding_amount: r.metrics.amount,
            days_since_claim: r.claim.days_since_claim,
            claim_status: r.claim.claim_status,
          })),
        },
      });
      if (error) throw error;
      const next = (data as { body?: string })?.body;
      if (next) {
        updateGroup(g.tpa, { body: next });
        toast.success(`Enhanced — ${g.tpa}`);
      }
    } catch (e) {
      toast.error("AI enhance failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setAiBusyTpa("");
    }
  };

  const sendAll = async () => {
    if (groups.length === 0) {
      toast.error("No claims selected");
      return;
    }
    setSending(true);
    let success = 0;
    let failed = 0;
    for (const g of groups) {
      try {
        const { data, error } = await supabase.functions.invoke("send-discrepancy-bulk", {
          body: {
            actingUserId: getActingUserId(),
            insurerName: g.tpa,
            recipientEmail: g.recipient,
            ccEmails: g.cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
            hospitalName: hospital,
            spocName: g.contact?.contact_name ?? "Claims Team",
            spocEmail: "",
            tone,
            customSubject: g.subject,
            customBody: g.body,
            claims: g.rows.map(({ claim, metrics }) => ({
              claim_id: claim.id,
              claim_number: claim.claim_number,
              patient_name: claim.patient_name,
              policy_number: claim.policy_number,
              date_of_admission: claim.date_of_admission,
              date_of_discharge: claim.date_of_discharge,
              approved_amount: claim.approved_amount,
              settled_amount: claim.settled_amount,
              tds_amount: claim.tds_amount,
              discrepancy_amount: metrics.amount,
              discrepancy_pct: metrics.pct,
              band: metrics.band ?? "low",
              claim_status: claim.claim_status,
            })),
          },
        });
        if (error) throw error;
        const ok = (data as { success?: boolean })?.success;
        if (!ok) throw new Error((data as { error?: string })?.error ?? "Send failed");
        success += 1;
      } catch (e) {
        console.error("[bulk-discrepancy]", g.tpa, e);
        failed += 1;
      }
    }
    setSending(false);
    if (failed === 0) {
      toast.success(`Sent ${success} consolidated email(s)`);
    } else {
      toast.warning(`${success} sent, ${failed} failed`);
    }
    onSent?.();
    onOpenChange(false);
  };

  const active = groups.find((g) => g.tpa === activeTpa);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Bulk Discrepancy Notice — {totals.tpaCount} TPA · {totals.claimCount} claim(s)
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">TPAs</div>
            <div className="text-base font-bold flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {totals.tpaCount}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Claims</div>
            <div className="text-base font-bold">{totals.claimCount}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total Discrepancy</div>
            <div className="text-base font-bold text-destructive">{inrShort(totals.amount)}</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Tone (applies to all groups)</Label>
          <RadioGroup
            value={tone}
            onValueChange={(v) => setTone(v as Tone)}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          >
            {TONE_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer ${
                  tone === o.value ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <RadioGroupItem value={o.value} className="h-3.5 w-3.5" />
                <span className="font-medium">{o.label}</span>
              </label>
            ))}
          </RadioGroup>
        </div>

        {groups.length > 0 && (
          <Tabs value={activeTpa} onValueChange={setActiveTpa}>
            <TabsList className="flex-wrap h-auto justify-start">
              {groups.map((g) => (
                <TabsTrigger key={g.tpa} value={g.tpa} className="text-xs">
                  {g.tpa}
                  <Badge variant="outline" className="ml-1.5 text-[9px] py-0">
                    {g.rows.length} · {inrShort(g.totalAmount)}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
            {active && (
              <TabsContent value={active.tpa} className="space-y-3 mt-3">
                {!active.contact && (
                  <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    No contact on file for <b>{active.tpa}</b> — using fallback recipient.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">To</Label>
                    <Input
                      value={active.recipient}
                      onChange={(e) => updateGroup(active.tpa, { recipient: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CC</Label>
                    <Input
                      value={active.cc}
                      onChange={(e) => updateGroup(active.tpa, { cc: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Subject</Label>
                  <Input
                    value={active.subject}
                    onChange={(e) => updateGroup(active.tpa, { subject: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Body</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => aiEnhanceGroup(active)}
                      disabled={aiBusyTpa === active.tpa}
                    >
                      {aiBusyTpa === active.tpa ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      AI Enhance
                    </Button>
                  </div>
                  <Textarea
                    value={active.body}
                    onChange={(e) => updateGroup(active.tpa, { body: e.target.value })}
                    rows={14}
                    className="font-mono text-xs resize-none"
                  />
                </div>
                <div className="rounded-md border bg-card p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Attached XLSX preview ({active.rows.length} rows)
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="text-left py-1 pr-2">Claim</th>
                          <th className="text-left py-1 pr-2">Patient</th>
                          <th className="text-right py-1 pr-2">Approved</th>
                          <th className="text-right py-1 pr-2">Settled+TDS</th>
                          <th className="text-right py-1">Short</th>
                        </tr>
                      </thead>
                      <tbody>
                        {active.rows.slice(0, 50).map((r) => (
                          <tr key={r.claim.id} className="border-t">
                            <td className="py-1 pr-2 font-mono">{r.claim.claim_number}</td>
                            <td className="py-1 pr-2">{r.claim.patient_name}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">{inrShort(r.claim.approved_amount)}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">{inrShort(r.claim.settled_amount + r.claim.tds_amount)}</td>
                            <td className="py-1 text-right tabular-nums text-destructive font-semibold">{inrShort(r.metrics.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={sendAll} disabled={sending || groups.length === 0}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            Send {totals.tpaCount} consolidated email{totals.tpaCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
