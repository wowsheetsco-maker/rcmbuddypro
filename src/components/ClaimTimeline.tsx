import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Sparkles, FileText, MessageSquare, Send, CheckCircle2,
  AlertTriangle, Upload, Banknote, ClipboardEdit, PhoneCall, Stethoscope,
  LogIn, LogOut, Calendar as CalendarIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Claim } from "@/data/mockClaims";
import { getHistory, fieldLabel } from "@/lib/claimEditHistory";

interface Props {
  claim: Claim;
}

export interface TimelineEvent {
  at: string; // ISO
  label: string;
  detail?: string | null;
  actor?: string | null;
  icon: React.ComponentType<{ className?: string }>;
  tone: "created" | "clinical" | "submission" | "query" | "denial" | "approval" | "comm" | "edit" | "settled" | "info";
  source: "field" | "follow_up" | "history" | "event";
}

interface DbClaimEvent {
  id: string;
  event_type: string;
  event_label: string;
  event_at: string;
  actor_name: string | null;
  details: Record<string, unknown> | null;
}

interface DbFollowUp {
  id: string;
  outcome: string;
  notes: string | null;
  next_action_date: string | null;
  promised_date: string | null;
  logged_at: string;
  logged_by: string | null;
}

const TONE_STYLES: Record<TimelineEvent["tone"], { dot: string; ring: string; badge: string }> = {
  created:    { dot: "bg-muted-foreground", ring: "ring-muted",            badge: "bg-muted text-muted-foreground" },
  clinical:   { dot: "bg-primary/70",       ring: "ring-primary/20",       badge: "bg-primary/10 text-primary" },
  submission: { dot: "bg-primary",          ring: "ring-primary/20",       badge: "bg-primary/10 text-primary" },
  query:      { dot: "bg-amber-500",        ring: "ring-amber-500/20",     badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  denial:     { dot: "bg-destructive",      ring: "ring-destructive/20",   badge: "bg-destructive/10 text-destructive" },
  approval:   { dot: "bg-success",          ring: "ring-success/20",       badge: "bg-success/10 text-success" },
  comm:       { dot: "bg-sky-500",          ring: "ring-sky-500/20",       badge: "bg-sky-500/10 text-sky-700 dark:text-sky-400" },
  edit:       { dot: "bg-muted-foreground/60", ring: "ring-muted",         badge: "bg-muted text-muted-foreground" },
  settled:    { dot: "bg-emerald-600",      ring: "ring-emerald-600/20",   badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  info:       { dot: "bg-muted-foreground/60", ring: "ring-muted",         badge: "bg-muted text-muted-foreground" },
};

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function classifyStatusEvent(status: string): { label: string; tone: TimelineEvent["tone"]; icon: TimelineEvent["icon"] } {
  const s = status.toLowerCase();
  if (/pre.?auth.*approved/.test(s)) return { label: `Pre-auth approved`,   tone: "approval",   icon: CheckCircle2 };
  if (/pre.?auth.*denied/.test(s))   return { label: `Pre-auth denied`,     tone: "denial",     icon: AlertTriangle };
  if (/pre.?auth.*query/.test(s))    return { label: `Pre-auth query`,      tone: "query",      icon: MessageSquare };
  if (/discharge.*approved/.test(s)) return { label: `Discharge approved`,  tone: "approval",   icon: CheckCircle2 };
  if (/discharge.*denied/.test(s))   return { label: `Discharge denied`,    tone: "denial",     icon: AlertTriangle };
  if (/discharge.*query/.test(s))    return { label: `Discharge query`,     tone: "query",      icon: MessageSquare };
  if (/claim.*approved/.test(s))     return { label: `Claim approved`,      tone: "approval",   icon: CheckCircle2 };
  if (/denied|rejected|repudiat/.test(s)) return { label: status,           tone: "denial",     icon: AlertTriangle };
  if (/query|shortfall|clarification/.test(s)) return { label: status,      tone: "query",      icon: MessageSquare };
  if (/settlement initiated/.test(s)) return { label: `Settlement initiated`, tone: "settled",  icon: Banknote };
  if (/settled|paid|closed/.test(s)) return { label: `Settled`,             tone: "settled",    icon: Banknote };
  return { label: status, tone: "info", icon: FileText };
}

export default function ClaimTimeline({ claim }: Props) {
  const [followUps, setFollowUps] = useState<DbFollowUp[]>([]);
  const [dbEvents, setDbEvents] = useState<DbClaimEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      supabase.from("follow_ups")
        .select("id, outcome, notes, next_action_date, promised_date, logged_at, logged_by")
        .eq("claim_id", claim.id)
        .order("logged_at", { ascending: true }),
      supabase.from("claim_events")
        .select("id, event_type, event_label, event_at, actor_name, details")
        .eq("claim_id", claim.id)
        .order("event_at", { ascending: true }),
    ]).then(([fu, ev]) => {
      if (cancelled) return;
      setFollowUps((fu.data ?? []) as DbFollowUp[]);
      setDbEvents((ev.data ?? []) as DbClaimEvent[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [claim.id]);

  const events = useMemo<TimelineEvent[]>(() => {
    const out: TimelineEvent[] = [];

    // 1. Derived events from claim fields
    if (claim.claim_creation_date) {
      out.push({
        at: new Date(claim.claim_creation_date).toISOString(),
        label: "Claim created",
        detail: claim.claim_number ? `# ${claim.claim_number}` : null,
        icon: FileText, tone: "created", source: "field",
      });
    }
    if (claim.date_of_admission) {
      out.push({
        at: new Date(claim.date_of_admission).toISOString(),
        label: "Patient admitted",
        detail: claim.hospital_name,
        icon: LogIn, tone: "clinical", source: "field",
      });
    }
    if (claim.date_of_discharge) {
      out.push({
        at: new Date(claim.date_of_discharge).toISOString(),
        label: "Patient discharged",
        detail: claim.treatment,
        icon: LogOut, tone: "clinical", source: "field",
      });
    }
    if (claim.doc_submission_date) {
      out.push({
        at: new Date(claim.doc_submission_date).toISOString(),
        label: "Documents submitted",
        detail: claim.receipt_no ? `Receipt: ${claim.receipt_no}` : null,
        icon: Upload, tone: "submission", source: "field",
      });
    }

    // Status-derived milestone (best-guess timestamp: doc_submission_date or claim_creation_date)
    if (claim.claim_status) {
      const c = classifyStatusEvent(claim.claim_status);
      const anchor = claim.payment_update_date || claim.doc_submission_date || claim.date_of_discharge || claim.claim_creation_date;
      if (anchor) {
        out.push({
          at: new Date(anchor).toISOString(),
          label: `Status: ${c.label}`,
          detail: claim.insurer_comments,
          icon: c.icon, tone: c.tone, source: "field",
        });
      }
    }

    if (claim.last_communication_at) {
      out.push({
        at: claim.last_communication_at,
        label: "Communication logged",
        detail: claim.last_communication_note,
        icon: PhoneCall, tone: "comm", source: "field",
      });
    }

    if (claim.settled_amount > 0 && claim.payment_update_date) {
      out.push({
        at: new Date(claim.cheque_neft_utr_date || claim.payment_update_date).toISOString(),
        label: "Payment received",
        detail: [
          `₹ ${claim.settled_amount.toLocaleString("en-IN")}`,
          claim.cheque_neft_utr_no ? `UTR ${claim.cheque_neft_utr_no}` : null,
          claim.tds_amount > 0 ? `TDS ₹${claim.tds_amount.toLocaleString("en-IN")}` : null,
        ].filter(Boolean).join(" · "),
        icon: Banknote, tone: "settled", source: "field",
      });
    }

    // 2. Follow-ups
    for (const fu of followUps) {
      out.push({
        at: fu.logged_at,
        label: `Follow-up: ${fu.outcome}`,
        detail: [
          fu.notes,
          fu.promised_date ? `Promised: ${new Date(fu.promised_date).toLocaleDateString("en-IN")}` : null,
          fu.next_action_date ? `Next: ${new Date(fu.next_action_date).toLocaleDateString("en-IN")}` : null,
        ].filter(Boolean).join(" · ") || null,
        actor: fu.logged_by,
        icon: MessageSquare, tone: "comm", source: "follow_up",
      });
    }

    // 3. Local edit history (workflow field changes)
    for (const h of getHistory(claim.id)) {
      out.push({
        at: h.at,
        label: `Edited ${fieldLabel(h.field)}`,
        detail: h.preview,
        icon: ClipboardEdit, tone: "edit", source: "history",
      });
    }

    // 4. Server-side claim_events (future-proof for logged activity)
    for (const ev of dbEvents) {
      out.push({
        at: ev.event_at,
        label: ev.event_label,
        detail: ev.details ? Object.entries(ev.details).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : null,
        actor: ev.actor_name,
        icon: Sparkles, tone: "info", source: "event",
      });
    }

    // Sort ascending by time
    out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return out;
  }, [claim, followUps, dbEvents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Building timeline…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No timeline events yet for this claim.
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Claim journey</h3>
        <span className="text-[11px] text-muted-foreground">
          · {events.length} events · pre-auth → discharge → submission → query → settlement
        </span>
      </div>

      <ol className="relative border-l-2 border-border ml-2 space-y-4">
        {events.map((ev, i) => {
          const s = TONE_STYLES[ev.tone];
          const Icon = ev.icon;
          const prevAt = i > 0 ? events[i - 1].at : null;
          const gapDays = prevAt
            ? Math.floor((new Date(ev.at).getTime() - new Date(prevAt).getTime()) / 86_400_000)
            : 0;
          return (
            <li key={`${ev.at}-${i}`} className="ml-4 relative">
              <span
                className={`absolute -left-[26px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ${s.dot} ${s.ring}`}
                aria-hidden
              />
              {gapDays > 3 && i > 0 && (
                <div className="text-[10px] text-muted-foreground -mt-1 mb-1 italic">
                  ↳ {gapDays} days later
                </div>
              )}
              <div className="rounded-md border bg-card p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${s.badge.split(" ").find((c) => c.startsWith("text-")) || ""}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{ev.label}</div>
                      {ev.detail && (
                        <div className="text-[11px] text-muted-foreground line-clamp-2">{ev.detail}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-[10.5px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      <CalendarIcon className="h-2.5 w-2.5" /> {fmt(ev.at)}
                    </span>
                    {ev.actor && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1">{ev.actor.slice(0, 8)}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <Send className="h-3 w-3" />
        Events are derived from claim data, follow-ups, and edit history.
        New activity is logged going forward for a fuller story.
      </div>
    </div>
  );
}
