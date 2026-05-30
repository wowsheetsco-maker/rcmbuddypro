// Per-claim discrepancy action drawer. Mirrors screenshot 2:
// - Header chips (claim no / patient / TPA / amounts)
// - Remarks (sync to claim master)
// - Tabs: Email · WhatsApp · Schedule
// - Tone selector + AI Enhance + Regenerate
// - Send single email via existing send-discrepancy-bulk fn (n=1)

import { useEffect, useMemo, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertCircle, Loader2, Mail, MessageSquare, Calendar, Sparkles,
  RefreshCw, Send, FileText, ArrowRightCircle, History,
  Clock, User as UserIcon, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BAND_META, inrShort, type DiscrepancyMetrics } from "@/lib/discrepancy";
import type { Claim } from "@/data/mockClaims";
import {
  findContactForProvider,
  type InsurerContactRow,
} from "@/hooks/useInsurerContacts";

type Tone = "formal" | "urgent" | "irdai" | "friendly";

interface TimelineEvent {
  id: string;
  action_type: string;
  performed_at: string;
  performed_by: string | null;
  channel: string | null;
  recipient: string | null;
  subject: string | null;
  body_preview: string | null;
  tone: string | null;
  notes: string | null;
  scheduled_for: string | null;
  bulk_batch_id: string | null;
}

const ACTION_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  email:        { label: "Email sent",         icon: Mail,            cls: "bg-primary/15 text-primary border-primary/40" },
  whatsapp:     { label: "WhatsApp opened",    icon: MessageSquare,   cls: "bg-success/15 text-success border-success/40" },
  schedule:     { label: "Reminder scheduled", icon: Calendar,        cls: "bg-warning/15 text-warning border-warning/40" },
  push_appeal:  { label: "Pushed to Appeal",   icon: ArrowRightCircle,cls: "bg-destructive/15 text-destructive border-destructive/40" },
  remark:       { label: "Remark updated",     icon: FileText,        cls: "bg-muted text-foreground border-border" },
};

const TONE_OPTIONS: { value: Tone; label: string; hint: string }[] = [
  { value: "formal",   label: "Formal Reminder",   hint: "Polite, structured corporate tone" },
  { value: "urgent",   label: "Urgent Escalation", hint: "Time-sensitive, assertive" },
  { value: "irdai",    label: "SLA Notice",      hint: "Regulatory, cites SLA guidelines" },
  { value: "friendly", label: "Friendly",          hint: "Warm, relationship-preserving" },
];

const ROLE_STORAGE_KEY = "rcm-buddy-role";
const ROLE_LABELS: Record<string, string> = {
  cfo: "CFO",
  billing: "Billing Manager",
  ops: "Ops Coordinator",
  admin: "Admin",
};

/** Best-effort actor label — uses the active sidebar role until real auth lands. */
function getActor(): string {
  if (typeof window === "undefined") return "User";
  try {
    const r = localStorage.getItem(ROLE_STORAGE_KEY) ?? "user";
    return ROLE_LABELS[r] ?? "User";
  } catch {
    return "User";
  }
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  claim: Claim | null;
  metrics: DiscrepancyMetrics | null;
  contacts: InsurerContactRow[];
  hospitalName?: string;
  onActionLogged?: () => void;
}

function defaultBody(claim: Claim, metrics: DiscrepancyMetrics, hospital: string, tone: Tone): string {
  const opener = tone === "urgent"
    ? `⚠️  URGENT DISCREPANCY — Claim ${claim.claim_number}\n\n${hospital} has identified a significant discrepancy of ${inrShort(metrics.amount)} in the following claim:`
    : tone === "irdai"
      ? `Sub: Discrepancy in claim settlement — Ref ${claim.claim_number}\n\nUnder SLA (Health Insurance) Regulations 2016, kindly take note of the following short-payment:`
      : tone === "friendly"
        ? `Hi team,\n\nHope you're doing well. We noticed a small short-payment on the below claim and would appreciate your help in reconciling it:`
        : `Dear Sir/Madam,\n\nGreetings from ${hospital}.\n\nWe wish to bring to your attention a discrepancy in the settlement of the following claim:`;

  return `${opener}

────────────────────────────────────
CLAIM DETAILS
────────────────────────────────────
Claim Number      : ${claim.claim_number}
Patient Name      : ${claim.patient_name}
Policy Number     : ${claim.policy_number ?? "—"}
Admission         : ${claim.date_of_admission ?? "—"}
Discharge         : ${claim.date_of_discharge ?? "—"}

────────────────────────────────────
FINANCIAL BREAKDOWN
────────────────────────────────────
Approved Amount   : ${inrShort(claim.approved_amount)}
Settled Amount    : ${inrShort(claim.settled_amount)}
TDS Deducted      : ${inrShort(claim.tds_amount)}
Discrepancy       : ${inrShort(metrics.amount)}  (${metrics.pct.toFixed(1)}%)
Severity          : ${metrics.band?.toUpperCase() ?? "—"}

Kindly review the above and process the short-paid amount at the earliest. Please share the UTR / payment acknowledgement once processed.

Thanks & Regards,
Billing & Reconciliation Team
${hospital}`;
}

export default function DiscrepancyActionDrawer({
  open, onOpenChange, claim, metrics, contacts, hospitalName, onActionLogged,
}: Props) {
  const [tone, setTone] = useState<Tone>("formal");
  const [tab, setTab] = useState<"email" | "whatsapp" | "schedule" | "timeline">("email");
  const [recipient, setRecipient] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [remarks, setRemarks] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [waMessage, setWaMessage] = useState("");
  const [waNumber, setWaNumber] = useState("");
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const hospital = hospitalName || claim?.hospital_name || "My Hospital";
  const contact = useMemo(
    () => (claim ? findContactForProvider(contacts, claim.tpa_name) : undefined),
    [claim, contacts],
  );

  // Reset whenever claim changes
  useEffect(() => {
    if (!claim || !metrics) return;
    setTone("formal");
    setRecipient(contact?.email ?? "claims@tpa.com");
    setCc(contact?.cc_emails ?? "rcmhead@hospital.com");
    setSubject(`Discrepancy Alert — Claim ${claim.claim_number} | ${hospital}`);
    setBody(defaultBody(claim, metrics, hospital, "formal"));
    setRemarks(claim.remarks ?? "");
    setWaNumber(contact?.whatsapp ?? contact?.phone ?? "");
    setWaMessage(
      `Hi, this is regarding a discrepancy in Claim ${claim.claim_number} (${claim.patient_name}). Approved ${inrShort(claim.approved_amount)} but settled ${inrShort(claim.settled_amount + claim.tds_amount)} (incl. TDS). Short-payment: ${inrShort(metrics.amount)}. Please assist. — ${hospital}`,
    );
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    setScheduleDate(tomorrow);
  }, [claim, metrics, contact, hospital]);

  // Load timeline whenever the claim changes or drawer reopens
  const loadTimeline = async (claimId: string) => {
    setTimelineLoading(true);
    const { data, error } = await supabase
      .from("discrepancy_action_log")
      .select("id, action_type, performed_at, performed_by, channel, recipient, subject, body_preview, tone, notes, scheduled_for, bulk_batch_id")
      .eq("claim_id", claimId)
      .order("performed_at", { ascending: false });
    if (!error && data) setTimeline(data as TimelineEvent[]);
    setTimelineLoading(false);
  };

  useEffect(() => {
    if (open && claim?.id) void loadTimeline(claim.id);
    if (!open) setTimeline([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, claim?.id]);

  const regenerate = () => {
    if (claim && metrics) setBody(defaultBody(claim, metrics, hospital, tone));
  };

  // When tone changes, refresh body to match
  useEffect(() => {
    if (claim && metrics) setBody(defaultBody(claim, metrics, hospital, tone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tone]);

  const handleAiEnhance = async () => {
    if (!claim || !metrics) return;
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-enhance-followup", {
        body: {
          tone,
          format: "text",
          insurerName: claim.tpa_name,
          hospitalName: hospital,
          claimCount: 1,
          totalOutstanding: metrics.amount,
          oldestDays: claim.days_since_claim,
          breachCount: claim.is_irdai_breach ? 1 : 0,
          currentBody: body,
          mode: "enhance",
          claims: [{
            claim_number: claim.claim_number,
            patient_name: claim.patient_name,
            outstanding_amount: metrics.amount,
            days_since_claim: claim.days_since_claim,
            claim_status: claim.claim_status,
          }],
        },
      });
      if (error) throw error;
      const next = (data as { body?: string })?.body;
      if (next) {
        setBody(next);
        toast.success("Enhanced with AI");
      }
    } catch (e) {
      toast.error("AI enhance failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setAiBusy(false);
    }
  };

  const persistRemarks = async () => {
    if (!claim) return;
    const trimmed = remarks.trim();
    if ((claim.remarks ?? "") === trimmed) return;
    await supabase.from("claims").update({ remarks: trimmed || null }).eq("id", claim.id);
  };

  const upsertActionRow = async (patch: Partial<{
    last_action_type: string;
    status: string;
    email_sent_count_increment: boolean;
    pushed: boolean;
  }>) => {
    if (!claim || !metrics) return;
    const { data: existing } = await supabase
      .from("discrepancy_actions")
      .select("id, email_sent_count")
      .eq("claim_id", claim.id)
      .maybeSingle();
    const baseUpdate: Record<string, unknown> = {
      last_action_type: patch.last_action_type ?? null,
      last_action_at: new Date().toISOString(),
    };
    if (patch.status) baseUpdate.status = patch.status;
    if (patch.pushed) {
      baseUpdate.stage = "appeal";
      baseUpdate.status = "in_appeal";
      baseUpdate.pushed_to_appeal_at = new Date().toISOString();
    }
    if (existing) {
      const upd: Record<string, unknown> = { ...baseUpdate };
      if (patch.email_sent_count_increment) {
        upd.email_sent_count = (existing.email_sent_count ?? 0) + 1;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase.from("discrepancy_actions").update(upd as any).eq("id", existing.id);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { getCurrentOrgId: _gco1 } = await import("@/lib/currentOrg");
      await supabase.from("discrepancy_actions").insert({
        org_id: _gco1(),
        claim_id: claim.id,
        flagged_amount: metrics.amount,
        flagged_pct: metrics.pct,
        flag_severity: metrics.band ?? "low",
        remarks: remarks.trim() || null,
        email_sent_count: patch.email_sent_count_increment ? 1 : 0,
        ...baseUpdate,
      } as any);
    }
  };

  const sendEmail = async () => {
    if (!claim || !metrics) return;
    setSending(true);
    try {
      await persistRemarks();
      const { getActingUserId } = await import("@/hooks/useActingUser");
      const { data, error } = await supabase.functions.invoke("send-discrepancy-bulk", {
        body: {
          actingUserId: getActingUserId(),
          insurerName: claim.tpa_name,
          recipientEmail: recipient,
          ccEmails: cc.split(/[,;]/).map((s) => s.trim()).filter(Boolean),
          hospitalName: hospital,
          spocName: claim.tpa_spoc ?? contact?.contact_name ?? "Claims Team",
          spocEmail: claim.hospital_spoc ?? "",
          tone,
          customSubject: subject,
          customBody: body,
          remarks: remarks.trim() || undefined,
          claims: [{
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
          }],
        },
      });
      if (error) throw error;
      const ok = (data as { success?: boolean })?.success;
      if (!ok) throw new Error((data as { error?: string })?.error ?? "Send failed");
      await upsertActionRow({
        last_action_type: "email",
        status: "reviewed",
        email_sent_count_increment: true,
      });
      toast.success("Discrepancy email sent");
      onActionLogged?.();
      onOpenChange(false);
    } catch (e) {
      toast.error("Send failed", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSending(false);
    }
  };

  const sendWhatsApp = async () => {
    if (!claim) return;
    if (!waNumber) {
      toast.error("No WhatsApp number on file for this TPA");
      return;
    }
    await persistRemarks();
    const { getCurrentOrgId: _gco2 } = await import("@/lib/currentOrg");
    await supabase.from("discrepancy_action_log").insert({
      org_id: _gco2(),
      claim_id: claim.id,
      action_type: "whatsapp",
      channel: "whatsapp",
      recipient: waNumber,
      body_preview: waMessage.slice(0, 240),
      notes: remarks.trim() || null,
      performed_by: getActor(),
    });
    await upsertActionRow({ last_action_type: "whatsapp", status: "reviewed" });
    const cleaned = waNumber.replace(/[^0-9]/g, "");
    const url = `https://wa.me/${cleaned}?text=${encodeURIComponent(waMessage)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("WhatsApp opened");
    onActionLogged?.();
    onOpenChange(false);
  };

  const schedule = async () => {
    if (!claim) return;
    if (!scheduleDate) {
      toast.error("Pick a date");
      return;
    }
    await persistRemarks();
    const { getCurrentOrgId: _gco3 } = await import("@/lib/currentOrg");
    await supabase.from("discrepancy_action_log").insert({
      org_id: _gco3(),
      claim_id: claim.id,
      action_type: "schedule",
      scheduled_for: new Date(scheduleDate).toISOString(),
      notes: remarks.trim() || null,
      performed_by: getActor(),
    });
    await upsertActionRow({ last_action_type: "schedule", status: "reviewed" });
    toast.success("Reminder scheduled");
    onActionLogged?.();
    onOpenChange(false);
  };

  const pushToAppeal = async () => {
    if (!claim || !metrics) return;
    await persistRemarks();
    await upsertActionRow({ last_action_type: "push_appeal", pushed: true });
    const { getCurrentOrgId: _gco4 } = await import("@/lib/currentOrg");
    await supabase.from("discrepancy_action_log").insert({
      org_id: _gco4(),
      claim_id: claim.id,
      action_type: "push_appeal",
      notes: remarks.trim() || "Pushed to Appeal Manager",
      performed_by: getActor(),
    });
    toast.success("Pushed to Appeal Manager");
    onActionLogged?.();
    onOpenChange(false);
  };

  if (!claim || !metrics) return null;

  const bandMeta = metrics.band ? BAND_META[metrics.band] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
      >
        <SheetHeader className="bg-sidebar text-sidebar-foreground px-5 py-4 sticky top-0 z-10 border-b">
          <SheetTitle className="text-sidebar-foreground flex items-center gap-2 text-base">
            <AlertCircle className="h-5 w-5 text-warning" />
            Discrepancy Action — <span className="font-mono">{claim.claim_number}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="p-5 space-y-5">
          {/* Header card */}
          <div className="rounded-lg border bg-card p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <Field label="Claim No"><span className="font-mono">{claim.claim_number}</span></Field>
              <Field label="Patient">{claim.patient_name}</Field>
              <Field label="TPA / Insurer"><span className="text-foreground">{claim.tpa_name}</span></Field>
              <Field label="Approved"><span className="text-foreground">{inrShort(claim.approved_amount)}</span></Field>
              <Field label="Settled+TDS"><span className="text-foreground">{inrShort(claim.settled_amount + claim.tds_amount)}</span></Field>
              <Field label="Discrepancy">
                <span className="text-destructive font-bold">{inrShort(metrics.amount)}</span>
                {bandMeta && (
                  <Badge variant="outline" className={`ml-1.5 text-[10px] ${bandMeta.cls}`}>
                    {bandMeta.label} · {metrics.pct.toFixed(1)}%
                  </Badge>
                )}
              </Field>
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Remarks / Notes <span className="text-muted-foreground">(included in all communications)</span>
            </Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add your remarks, response notes, or action taken… (saved to claim record)"
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Tabs */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="email"><Mail className="h-3.5 w-3.5 mr-1" /> Email</TabsTrigger>
              <TabsTrigger value="whatsapp"><MessageSquare className="h-3.5 w-3.5 mr-1" /> WhatsApp</TabsTrigger>
              <TabsTrigger value="schedule"><Calendar className="h-3.5 w-3.5 mr-1" /> Schedule</TabsTrigger>
              <TabsTrigger value="timeline">
                <History className="h-3.5 w-3.5 mr-1" />
                Timeline
                {timeline.length > 0 && (
                  <Badge variant="outline" className="ml-1.5 text-[9px] py-0 px-1.5">
                    {timeline.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-4 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">To (TPA / Insurer email)</Label>
                  <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CC</Label>
                  <Input value={cc} onChange={(e) => setCc(e.target.value)} className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tone</Label>
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
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Email Body (editable)</Label>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" onClick={regenerate} className="h-7 text-xs">
                      <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleAiEnhance} disabled={aiBusy} className="h-7 text-xs">
                      {aiBusy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                      AI Enhance
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={14}
                  className="font-mono text-xs resize-y"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={pushToAppeal}>
                  <ArrowRightCircle className="h-3.5 w-3.5 mr-1" /> Push to Appeal
                </Button>
                <Button onClick={sendEmail} disabled={sending || !recipient}>
                  {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Send Email
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-4 mt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">WhatsApp Number</Label>
                <Input value={waNumber} onChange={(e) => setWaNumber(e.target.value)} className="h-9 text-sm" placeholder="+91…" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Message</Label>
                <Textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} rows={6} className="text-sm resize-y" />
              </div>
              <div className="flex justify-end">
                <Button onClick={sendWhatsApp}>
                  <MessageSquare className="h-4 w-4 mr-1.5" /> Open in WhatsApp
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="space-y-4 mt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Remind me on</Label>
                <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="h-9 text-sm" />
              </div>
              <p className="text-xs text-muted-foreground">
                Saves a reminder on this claim. You'll see it in the Follow-up Calendar.
              </p>
              <div className="flex justify-end">
                <Button onClick={schedule}>
                  <Calendar className="h-4 w-4 mr-1.5" /> Schedule reminder
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="mt-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <History className="h-3.5 w-3.5" />
                  All discrepancy actions taken on this claim, newest first.
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => claim?.id && void loadTimeline(claim.id)}
                  disabled={timelineLoading}
                >
                  {timelineLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                </Button>
              </div>

              {timelineLoading && timeline.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                  Loading timeline…
                </div>
              ) : timeline.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground rounded-md border border-dashed">
                  No actions logged yet. Send an email, WhatsApp, or schedule a reminder to start the timeline.
                </div>
              ) : (
                <ol className="relative border-l-2 border-border ml-3 space-y-4">
                  {timeline.map((ev) => {
                    const meta = ACTION_META[ev.action_type] ?? {
                      label: ev.action_type,
                      icon: FileText,
                      cls: "bg-muted text-foreground border-border",
                    };
                    const Icon = meta.icon;
                    return (
                      <li key={ev.id} className="ml-4 relative">
                        <span
                          className={`absolute -left-[1.45rem] top-0.5 grid h-5 w-5 place-items-center rounded-full border ${meta.cls}`}
                          aria-hidden
                        >
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="rounded-md border bg-card p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>
                              {meta.label}
                            </Badge>
                            {ev.tone && (
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {ev.tone}
                              </Badge>
                            )}
                            {ev.bulk_batch_id && (
                              <Badge variant="outline" className="text-[10px]">
                                bulk
                              </Badge>
                            )}
                            <span className="ml-auto text-[11px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {fmtRelative(ev.performed_at)}
                            </span>
                          </div>
                          <div className="mt-1.5 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            <span className="flex items-center gap-1">
                              <UserIcon className="h-3 w-3" />
                              {ev.performed_by ?? "System"}
                            </span>
                            <span>{new Date(ev.performed_at).toLocaleString()}</span>
                            {ev.recipient && (
                              <span className="flex items-center gap-1">
                                <ArrowRight className="h-3 w-3" />
                                {ev.recipient}
                              </span>
                            )}
                            {ev.scheduled_for && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Reminder for {new Date(ev.scheduled_for).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {ev.subject && (
                            <div className="mt-2 text-xs">
                              <span className="text-muted-foreground">Subject: </span>
                              <span className="font-medium">{ev.subject}</span>
                            </div>
                          )}
                          {ev.body_preview && (
                            <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                              {ev.body_preview}
                            </p>
                          )}
                          {ev.notes && (
                            <div className="mt-2 rounded border-l-2 border-primary/40 bg-muted/40 px-2 py-1 text-xs">
                              <span className="text-muted-foreground">Note: </span>
                              {ev.notes}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  );
}
