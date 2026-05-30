// Outstanding Reminders — bulk send/schedule "pending claims" reminder
// emails to TPAs and Insurers. The recipient email is auto-pulled from
// the InsurerProfile (escalation matrix L1) and an Excel of pending
// claims is generated and attached server-side.

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, Mail, Send, Trash2, XCircle,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Metric } from "@/components/ui/metric";
import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { RcmIcons } from "@/lib/icons";
import RowActionButtons from "@/components/RowActionButtons";
import BulkFollowUpComposer, { type ComposerTarget, type FollowUpTone } from "@/components/BulkFollowUpComposer";
import WhatsAppComposerDialog from "@/components/WhatsAppComposerDialog";
import { useInsurerContacts, findContactForProvider } from "@/hooks/useInsurerContacts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getActingUserId } from "@/hooks/useActingUser";
import { mockClaims, formatInrCompact, type Claim } from "@/data/mockClaims";
import { isExcludedFromOutstanding } from "@/lib/claimMetrics";
import { insurerProfiles, type InsurerProfile } from "@/data/insurerProfiles";

type Status = "scheduled" | "sent" | "failed" | "cancelled";

interface Reminder {
  id: string;
  insurer_id: number;
  insurer_name: string;
  recipient_email: string;
  scheduled_at: string;
  sent_at: string | null;
  status: Status;
  claim_count: number;
  total_outstanding: number;
  oldest_claim_days: number | null;
  error_message: string | null;
  created_at: string;
}

interface InsurerSummary {
  profile: InsurerProfile;
  recipientEmail: string;
  spocName: string;
  ccEmails: string[];
  claims: Claim[];
  total: number;
  oldest: number;
  breaches: number;
}

function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(n);
}

function compactInr(n: number): string {
  // Delegates to the canonical compact formatter so abbreviations match
  // the rest of the platform (₹X.XX Cr / ₹X.XX L / ₹X.X K).
  return formatInrCompact(n);
}

function buildSummaries(): InsurerSummary[] {
  const byInsurer = new Map<string, Claim[]>();
  for (const c of mockClaims) {
    if (c.outstanding_amount <= 0) continue;
    // Denied claims (claim/enhancement/pre-auth denied) belong only on the
    // Denials page — never under outstanding.
    if (isExcludedFromOutstanding(c)) continue;
    const key = c.tpa_name || c.insurance_company_name || "Unknown";
    if (!byInsurer.has(key)) byInsurer.set(key, []);
    byInsurer.get(key)!.push(c);
  }

  return insurerProfiles
    .map((p) => {
      // Match claims to this insurer by name (TPA or insurer)
      const claims =
        byInsurer.get(p.name) ??
        Array.from(byInsurer.entries())
          .filter(([k]) => k.toLowerCase().includes(p.name.toLowerCase().split(" ")[0]))
          .flatMap(([, v]) => v);

      const total = claims.reduce((s, c) => s + c.outstanding_amount, 0);
      const oldest = claims.reduce((m, c) => Math.max(m, c.days_since_claim), 0);
      const breaches = claims.filter((c) => c.is_irdai_breach).length;

      const l1 = p.escalationMatrix.find((e) => e.level === "L1");
      return {
        profile: p,
        recipientEmail: l1?.email ?? "",
        spocName: l1?.name ?? "Claims Team",
        ccEmails: p.escalationMatrix.filter((e) => e.level !== "L1").map((e) => e.email),
        claims,
        total,
        oldest,
        breaches,
      };
    })
    // Always show insurers with profiles; sort by outstanding desc, prioritizing those with claims
    .sort((a, b) => b.total - a.total);
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string; Icon: typeof Clock }> = {
    scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-800 border-blue-200", Icon: CalendarClock },
    sent:      { label: "Sent",      cls: "bg-emerald-100 text-emerald-800 border-emerald-200", Icon: CheckCircle2 },
    failed:    { label: "Failed",    cls: "bg-red-100 text-red-800 border-red-200", Icon: XCircle },
    cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground border-border", Icon: XCircle },
  };
  const { label, cls, Icon } = map[status];
  return (
    <Badge variant="outline" className={cn("gap-1", cls)}>
      <Icon className="h-3 w-3" /> {label}
    </Badge>
  );
}

export default function OutstandingRemindersPage() {
  const summaries = useMemo(() => buildSummaries(), []);
  const withClaims = summaries.filter((s) => s.claims.length > 0);
  const grandTotal = withClaims.reduce((s, x) => s + x.total, 0);
  const totalClaims = withClaims.reduce((s, x) => s + x.claims.length, 0);
  const totalBreaches = withClaims.reduce((s, x) => s + x.breaches, 0);

  const { contacts } = useInsurerContacts();

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleTargets, setScheduleTargets] = useState<InsurerSummary[]>([]);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(new Date(Date.now() + 86400000));
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [editEmailFor, setEditEmailFor] = useState<number | null>(null);
  const [emailOverrides, setEmailOverrides] = useState<Record<number, string>>({});

  // Single-TPA composers (Email / WhatsApp) — same UX as Priority Worklist
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTarget, setComposerTarget] = useState<ComposerTarget | null>(null);
  const [composerTone, setComposerTone] = useState<FollowUpTone>("formal");
  const [waOpen, setWaOpen] = useState(false);
  const [waRole, setWaRole] = useState<string>("billing");
  const [waCtx, setWaCtx] = useState<{
    claimId: string;
    recipient: string | null;
    recipientLabel: string;
    context: {
      patient_name: string | null;
      claim_number: string | null;
      hospital_name: string | null;
      outstanding_amount: number | null;
      days_since_claim: number | null;
      tpa_name: string | null;
      tpa_spoc_name: string | null;
      insurance_company_name: string | null;
      last_communication_note: string | null;
    };
  } | null>(null);

  const openEmailFor = (s: InsurerSummary, tone: FollowUpTone = "formal") => {
    setComposerTone(tone);
    setComposerTarget({
      insurerName: s.profile.name,
      recipientEmail: emailOverrides[s.profile.id] ?? s.recipientEmail,
      ccEmails: s.ccEmails.join(", "),
      whatsapp: findContactForProvider(contacts, s.profile.name)?.whatsapp ?? null,
      claims: s.claims,
    });
    setComposerOpen(true);
  };

  const openWhatsAppFor = (s: InsurerSummary, role: string = "billing") => {
    const contact = findContactForProvider(contacts, s.profile.name);
    const top = s.claims[0];
    setWaRole(role);
    setWaCtx({
      claimId: top?.id ?? "",
      recipient: contact?.whatsapp ?? null,
      recipientLabel: `${s.profile.name} · WhatsApp`,
      context: {
        patient_name: top?.patient_name ?? null,
        claim_number: top?.claim_number ?? null,
        hospital_name: top?.hospital_name ?? null,
        outstanding_amount: s.total,
        days_since_claim: s.oldest,
        tpa_name: s.profile.name,
        tpa_spoc_name: contact?.contact_name ?? s.spocName,
        insurance_company_name: top?.insurance_company_name ?? null,
        last_communication_note: null,
      },
    });
    setWaOpen(true);
  };

  const callFor = (s: InsurerSummary) => {
    const contact = findContactForProvider(contacts, s.profile.name);
    const num = contact?.phone || contact?.whatsapp;
    if (!num) {
      toast.error(`No phone number on file for ${s.profile.name}`, {
        description: "Add a phone number in Settings → Contacts.",
      });
      return;
    }
    window.location.href = `tel:${num.replace(/\s+/g, "")}`;
  };

  const loadReminders = async () => {
    const { data, error } = await supabase
      .from("outstanding_reminders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error("Failed to load reminders");
      return;
    }
    setReminders((data ?? []) as Reminder[]);
  };

  useEffect(() => {
    loadReminders();
  }, []);

  const toggleAll = () => {
    if (selected.size === withClaims.length) setSelected(new Set());
    else setSelected(new Set(withClaims.map((s) => s.profile.id)));
  };

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const buildPayload = (s: InsurerSummary) => ({
    insurerId: s.profile.id,
    insurerName: s.profile.name,
    recipientEmail: emailOverrides[s.profile.id] ?? s.recipientEmail,
    ccEmails: s.ccEmails,
    hospitalName: "AHMC Hospital",
    spocName: s.spocName,
    spocEmail: s.profile.hospitalSpoc.email,
    paymentTatDays: s.profile.paymentTat,
    claims: s.claims.map((c) => ({
      claim_number: c.claim_number,
      patient_name: c.patient_name,
      policy_number: c.policy_number,
      date_of_admission: c.date_of_admission,
      date_of_discharge: c.date_of_discharge,
      doc_submission_date: c.doc_submission_date,
      outstanding_amount: c.outstanding_amount,
      days_since_claim: c.days_since_claim,
      claim_status: c.claim_status,
      is_irdai_breach: c.is_irdai_breach,
    })),
  });

  const sendNow = async (targets: InsurerSummary[]) => {
    if (targets.length === 0) {
      toast.error("Select at least one TPA / Insurer");
      return;
    }
    setLoading(true);
    let ok = 0, fail = 0;
    for (const t of targets) {
      const recipient = emailOverrides[t.profile.id] ?? t.recipientEmail;
      if (!recipient) {
        toast.error(`No email on file for ${t.profile.name}`);
        fail++; continue;
      }
      try {
        const payload = buildPayload(t);
        // Log a "sent" record
        const { getCurrentOrgId: _gco } = await import("@/lib/currentOrg");
        const { data: row } = await supabase
          .from("outstanding_reminders")
          .insert({
            org_id: _gco(),
            insurer_id: t.profile.id,
            insurer_name: t.profile.name,
            recipient_email: recipient,
            cc_emails: t.ccEmails,
            scheduled_at: new Date().toISOString(),
            status: "scheduled",
            claim_count: t.claims.length,
            total_outstanding: t.total,
            oldest_claim_days: t.oldest,
            payload,
          })
          .select()
          .single();

        const { data, error } = await supabase.functions.invoke("send-outstanding-reminder", {
          body: { ...payload, reminderId: row?.id, actingUserId: getActingUserId() },
        });
        if (error || (data && data.success === false)) {
          fail++;
          toast.error(`${t.profile.name}: ${error?.message ?? data?.error ?? "Send failed"}`);
        } else {
          ok++;
        }
      } catch (e) {
        fail++;
        toast.error(`${t.profile.name}: ${e instanceof Error ? e.message : "Send failed"}`);
      }
    }
    setLoading(false);
    if (ok > 0) toast.success(`${ok} reminder${ok === 1 ? "" : "s"} sent successfully`);
    setSelected(new Set());
    loadReminders();
  };

  const openScheduleDialog = (targets: InsurerSummary[]) => {
    if (targets.length === 0) { toast.error("Select at least one TPA / Insurer"); return; }
    setScheduleTargets(targets);
    setScheduleDialogOpen(true);
  };

  const confirmSchedule = async () => {
    if (!scheduleDate) { toast.error("Pick a date"); return; }
    const [h, m] = scheduleTime.split(":").map(Number);
    const at = new Date(scheduleDate);
    at.setHours(h, m, 0, 0);
    if (at.getTime() <= Date.now()) {
      toast.error("Pick a future date and time");
      return;
    }
    setLoading(true);
    let ok = 0;
    for (const t of scheduleTargets) {
      const recipient = emailOverrides[t.profile.id] ?? t.recipientEmail;
      if (!recipient) continue;
      const payload = buildPayload(t);
      const { getCurrentOrgId: _gco2 } = await import("@/lib/currentOrg");
      const { error } = await supabase.from("outstanding_reminders").insert({
        org_id: _gco2(),
        insurer_id: t.profile.id,
        insurer_name: t.profile.name,
        recipient_email: recipient,
        cc_emails: t.ccEmails,
        scheduled_at: at.toISOString(),
        status: "scheduled",
        claim_count: t.claims.length,
        total_outstanding: t.total,
        oldest_claim_days: t.oldest,
        payload,
      });
      if (!error) ok++;
    }
    setLoading(false);
    setScheduleDialogOpen(false);
    setSelected(new Set());
    if (ok > 0) toast.success(`Scheduled ${ok} reminder${ok === 1 ? "" : "s"} for ${format(at, "PPp")}`);
    loadReminders();
  };

  const cancelReminder = async (id: string) => {
    const { error } = await supabase
      .from("outstanding_reminders")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Reminder cancelled"); loadReminders(); }
  };

  const deleteReminder = async (id: string) => {
    const { error } = await supabase.from("outstanding_reminders").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); loadReminders(); }
  };

  const selectedSummaries = withClaims.filter((s) => selected.has(s.profile.id));

  return (
    <AppLayout>
      <TooltipProvider delayDuration={150}>
      <div className="px-4 md:px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Outstanding Reminders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send beautifully formatted reminder emails with attached Excel of pending claims to TPAs &amp; Insurers — instantly, or scheduled for any future date &amp; time.
          </p>
        </div>

        {/* KPIs — unified KpiCard for visual consistency */}
        <KpiGrid cols={4}>
          <KpiCard
            label="Total Outstanding"
            value={compactInr(grandTotal)}
            icon={<RcmIcons.amount className="h-3.5 w-3.5 text-primary" />}
            caption="All pending AR"
          />
          <KpiCard
            label="Pending Claims"
            value={totalClaims}
            icon={<RcmIcons.inbox className="h-3.5 w-3.5 text-secondary" />}
            caption="Awaiting payment"
          />
          <KpiCard
            label="TPAs / Insurers"
            value={withClaims.length}
            icon={<RcmIcons.team className="h-3.5 w-3.5 text-primary" />}
            caption="Payers with dues"
          />
          <KpiCard
            label="SLA Breaches"
            value={totalBreaches}
            tone="denial"
            icon={<RcmIcons.warning className="h-3.5 w-3.5 text-destructive" />}
            caption=">15 days outstanding"
          />
        </KpiGrid>

        <Tabs defaultValue="send">
          <TabsList>
            <TabsTrigger value="send">Send / Schedule ({withClaims.length})</TabsTrigger>
            <TabsTrigger value="history">History ({reminders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="send" className="space-y-4">
            {/* Bulk action bar */}
            <Card className="p-3 flex flex-wrap items-center gap-2 bg-muted/40">
              <div className="flex items-center gap-2 text-sm font-medium px-2">
                <Checkbox
                  checked={selected.size > 0 && selected.size === withClaims.length}
                  onCheckedChange={toggleAll}
                />
                {selected.size === 0
                  ? `Select TPAs to send`
                  : `${selected.size} selected · ${compactInr(selectedSummaries.reduce((s, x) => s + x.total, 0))} outstanding`}
              </div>
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={selected.size === 0 || loading}
                  onClick={() => openScheduleDialog(selectedSummaries)}
                >
                  <CalendarClock className="h-4 w-4" /> Schedule
                </Button>
                <Button
                  size="sm"
                  disabled={selected.size === 0 || loading}
                  onClick={() => sendNow(selectedSummaries)}
                >
                  <Send className="h-4 w-4" /> Send Now ({selected.size})
                </Button>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>TPA / Insurer</TableHead>
                    <TableHead>Recipient (auto from L1 SPOC)</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-center">Oldest</TableHead>
                    <TableHead className="text-center">SLA</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withClaims.map((s) => {
                    const recipient = emailOverrides[s.profile.id] ?? s.recipientEmail;
                    const editing = editEmailFor === s.profile.id;
                    return (
                      <TableRow key={s.profile.id} className={selected.has(s.profile.id) ? "bg-muted/40" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(s.profile.id)}
                            onCheckedChange={() => toggleOne(s.profile.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{s.profile.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.profile.type === "tpa" ? "TPA" : "Insurer"} · TAT {s.profile.paymentTat}d
                          </div>
                        </TableCell>
                        <TableCell>
                          {editing ? (
                            <div className="flex gap-1">
                              <Input
                                autoFocus
                                value={recipient}
                                onChange={(e) => setEmailOverrides({ ...emailOverrides, [s.profile.id]: e.target.value })}
                                onBlur={() => setEditEmailFor(null)}
                                onKeyDown={(e) => e.key === "Enter" && setEditEmailFor(null)}
                                className="h-7 text-xs"
                              />
                            </div>
                          ) : (
                            <button
                              className="text-xs text-left hover:text-primary flex items-center gap-1.5 group"
                              onClick={() => setEditEmailFor(s.profile.id)}
                              title="Click to edit"
                            >
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span className={cn("truncate", !recipient && "text-red-600")}>
                                {recipient || "⚠ no email — click to add"}
                              </span>
                            </button>
                          )}
                          {s.ccEmails.length > 0 && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              + cc: L2/L3 ({s.ccEmails.length})
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{s.claims.length}</TableCell>
                        <TableCell className="text-right font-semibold text-sm">{compactInr(s.total)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={s.oldest > 30 ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-800 border-amber-200"}>
                            {s.oldest}d
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {s.breaches > 0 ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                              <AlertTriangle className="h-3 w-3" /> {s.breaches}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end items-center gap-1.5">
                            <RowActionButtons
                              onEmail={(tone) => openEmailFor(s, tone)}
                              onWhatsApp={(role) => openWhatsAppFor(s, role)}
                              onCall={() => callFor(s)}
                            />
                            <Button
                              variant="outline" size="sm"
                              disabled={loading}
                              onClick={() => openScheduleDialog([s])}
                              title="Schedule reminder"
                              className="h-7 px-2"
                            >
                              <CalendarClock className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              disabled={loading || !recipient}
                              onClick={() => sendNow([s])}
                              title="Send reminder + Excel now"
                              className="h-7 px-2"
                            >
                              <Send className="h-3.5 w-3.5 mr-1" /> Send
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {withClaims.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                        🎉 No outstanding claims across any TPA / Insurer.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>TPA / Insurer</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Scheduled For</TableHead>
                    <TableHead>Sent At</TableHead>
                    <TableHead className="text-right">Claims</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reminders.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm font-medium">{r.insurer_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.recipient_email}</TableCell>
                      <TableCell className="text-xs">{format(new Date(r.scheduled_at), "dd MMM yyyy, HH:mm")}</TableCell>
                      <TableCell className="text-xs">{r.sent_at ? format(new Date(r.sent_at), "dd MMM, HH:mm") : "—"}</TableCell>
                      <TableCell className="text-right text-sm">{r.claim_count}</TableCell>
                      <TableCell className="text-right text-sm font-mono">{compactInr(Number(r.total_outstanding))}</TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={r.status} />
                        {r.error_message && (
                          <div className="text-[10px] text-red-600 mt-1 truncate max-w-[180px]" title={r.error_message}>
                            {r.error_message}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.status === "scheduled" && (
                            <Button variant="outline" size="sm" onClick={() => cancelReminder(r.id)}>Cancel</Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => deleteReminder(r.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {reminders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                        No reminders sent yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Schedule dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Reminder</DialogTitle>
            <DialogDescription>
              Pick the date and time when {scheduleTargets.length === 1
                ? <strong>{scheduleTargets[0]?.profile.name}</strong>
                : <><strong>{scheduleTargets.length}</strong> reminder emails</>} should be sent automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start mt-1">
                      <CalendarClock className="h-4 w-4" />
                      {scheduleDate ? format(scheduleDate, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduleDate}
                      onSelect={setScheduleDate}
                      disabled={(d) => d < new Date(Date.now() - 86400000)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Time</Label>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
              <div><strong>Recipients:</strong></div>
              {scheduleTargets.slice(0, 5).map((t) => (
                <div key={t.profile.id} className="text-muted-foreground">
                  • {t.profile.name} → {emailOverrides[t.profile.id] ?? t.recipientEmail}
                </div>
              ))}
              {scheduleTargets.length > 5 && (
                <div className="text-muted-foreground">+ {scheduleTargets.length - 5} more</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmSchedule} disabled={loading}>
              <CalendarClock className="h-4 w-4" /> Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single-TPA email composer */}
      <BulkFollowUpComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        target={composerTarget}
        hospitalName="My Hospital"
        defaultTone={composerTone}
      />

      {/* Single-TPA WhatsApp composer */}
      <WhatsAppComposerDialog
        open={waOpen}
        onOpenChange={setWaOpen}
        claimId={waCtx?.claimId ?? ""}
        recipient={waCtx?.recipient ?? null}
        recipientLabel={waCtx?.recipientLabel}
        defaultRole={waRole}
        context={waCtx?.context ?? {
          patient_name: null, claim_number: null, hospital_name: null,
          outstanding_amount: null, days_since_claim: null, tpa_name: null,
          tpa_spoc_name: null, insurance_company_name: null, last_communication_note: null,
        }}
      />
      </TooltipProvider>
    </AppLayout>
  );
}
