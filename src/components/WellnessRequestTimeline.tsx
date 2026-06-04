import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  CheckCircle2, Clock, Mail, MessageCircle, Phone, AlertCircle, FileUp,
  CalendarClock, XCircle, PlusCircle, RotateCw, FileSpreadsheet, FileText,
} from "lucide-react";
import { mailto, whatsappLink } from "@/lib/wellnessMessaging";
import { exportAuditPdf, exportAuditXlsx, type AuditEvent } from "@/lib/wellnessAuditExport";
import { getCurrentOrgId } from "@/lib/currentOrg";

const ICONS: Record<string, any> = {
  created: PlusCircle, confirmed: CheckCircle2, rescheduled: CalendarClock,
  cancelled: XCircle, report_sent: FileUp, invoice_generated: FileUp,
  email_sent: Mail, whatsapp_sent: MessageCircle, call_logged: Phone,
};

const STATUS_VARIANT: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
  delivered: "default", opened: "default", sent: "default",
  drafted: "secondary", logged: "outline", failed: "destructive",
};

export function WellnessRequestTimeline({
  requestId, open, onOpenChange, clientName, clientEmail, clientPhone, providerName,
}: {
  requestId: string | null; open: boolean; onOpenChange: (v: boolean) => void;
  clientName?: string; clientEmail?: string | null; clientPhone?: string | null; providerName?: string;
}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!requestId) return;
    setLoading(true);
    supabase.from("wellness_request_events" as never)
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setEvents((data ?? []) as unknown as AuditEvent[]);
        setLoading(false);
      });
  }, [requestId]);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  const resend = async (ev: AuditEvent) => {
    if (!requestId) return;
    // Re-open the appropriate draft based on channel and original message.
    const subjectLine = ev.message?.split("\n\n")[0] ?? "Follow-up";
    const body = ev.message?.includes("\n\n") ? ev.message.slice(subjectLine.length + 2) : (ev.message ?? "");
    try {
      if (ev.channel === "email") {
        const to = ev.recipient || clientEmail || "";
        window.open(mailto(to, subjectLine, body), "_blank");
      } else if (ev.channel === "whatsapp") {
        const phone = ev.recipient || clientPhone || "";
        window.open(whatsappLink(phone, ev.message ?? ""), "_blank");
      } else {
        toast({ title: "Cannot resend", description: "This event has no email/WhatsApp channel.", variant: "destructive" });
        return;
      }
      // Bump retry count on original + log a new resend event
      await (supabase.from("wellness_request_events" as never) as any)
        .update({ retry_count: (ev.retry_count ?? 0) + 1 })
        .eq("id", ev.id);
      await supabase.from("wellness_request_events" as never).insert({
        org_id: getCurrentOrgId(),
        request_id: requestId,
        action: ev.action,
        channel: ev.channel,
        status: "drafted",
        recipient: ev.recipient,
        message: ev.message,
        resent_from_event_id: ev.id,
        meta: { resend: true },
      } as any);
      toast({ title: "Draft re-opened and logged" });
      reload();
    } catch (e) {
      toast({ title: "Resend failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  const meta = { clientName, providerName, requestId: requestId ?? undefined };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Audit timeline {clientName ? `· ${clientName}` : ""}</SheetTitle>
        </SheetHeader>

        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" disabled={!events.length} onClick={() => exportAuditXlsx(events, meta)}>
            <FileSpreadsheet className="h-3 w-3 mr-1" /> Excel
          </Button>
          <Button size="sm" variant="outline" disabled={!events.length} onClick={() => exportAuditPdf(events, meta)}>
            <FileText className="h-3 w-3 mr-1" /> PDF
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
            events.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No events recorded yet.</div> :
            events.map((e) => {
              const Icon = ICONS[e.action] ?? Clock;
              const ChanIcon = e.channel === "email" ? Mail : e.channel === "whatsapp" ? MessageCircle : e.channel === "call" ? Phone : null;
              const canResend = (e.channel === "email" || e.channel === "whatsapp") && (e.status === "failed" || e.status === "drafted" || e.status === "sent");
              return (
                <div key={e.id} className="flex gap-3 border rounded-md p-3">
                  <div className="mt-0.5"><Icon className="h-4 w-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm capitalize">{e.action.replaceAll("_", " ")}</span>
                      {ChanIcon && <ChanIcon className="h-3 w-3 text-muted-foreground" />}
                      <Badge variant={STATUS_VARIANT[e.status] ?? "outline"} className="text-[10px]">{e.status}</Badge>
                      {(e.retry_count ?? 0) > 0 && <Badge variant="outline" className="text-[10px]">×{e.retry_count}</Badge>}
                      {e.resent_from_event_id && <Badge variant="secondary" className="text-[10px]">resend</Badge>}
                    </div>
                    {e.recipient && <div className="text-xs text-muted-foreground mt-0.5">{e.recipient}</div>}
                    {e.message && <div className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{e.message}</div>}
                    {e.last_error && (
                      <div className="text-xs text-destructive mt-1 flex items-start gap-1">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{e.last_error}</span>
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-1 flex gap-3 flex-wrap">
                      <span>{new Date(e.created_at).toLocaleString()}</span>
                      {e.delivered_at && <span className="text-emerald-600">Delivered {new Date(e.delivered_at).toLocaleTimeString()}</span>}
                      {e.opened_at && <span className="text-emerald-700">Opened {new Date(e.opened_at).toLocaleTimeString()}</span>}
                    </div>
                    {canResend && (
                      <div className="mt-2">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => resend(e)}>
                          <RotateCw className="h-3 w-3 mr-1" /> Resend last message
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          }
        </div>
      </SheetContent>
    </Sheet>
  );
}

export async function logWellnessEvent(args: {
  orgId: string; requestId: string; action: string;
  channel?: string | null; status?: string;
  message?: string | null; recipient?: string | null;
  meta?: Record<string, unknown>;
  lastError?: string | null;
  resentFromEventId?: string | null;
  deliveredAt?: string | null;
}) {
  await supabase.from("wellness_request_events" as never).insert({
    org_id: args.orgId,
    request_id: args.requestId,
    action: args.action,
    channel: args.channel ?? null,
    status: args.status ?? "logged",
    message: args.message ?? null,
    recipient: args.recipient ?? null,
    meta: args.meta ?? {},
    last_error: args.lastError ?? null,
    resent_from_event_id: args.resentFromEventId ?? null,
    delivered_at: args.deliveredAt ?? null,
  } as any);
}
