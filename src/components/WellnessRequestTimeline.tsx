import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Clock, Mail, MessageCircle, Phone, AlertCircle, FileUp, CalendarClock, XCircle, PlusCircle } from "lucide-react";

interface Event {
  id: string; action: string; channel: string | null; status: string;
  message: string | null; recipient: string | null;
  delivered_at: string | null; opened_at: string | null;
  meta: any; created_at: string;
}

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
  requestId, open, onOpenChange, clientName,
}: { requestId: string | null; open: boolean; onOpenChange: (v: boolean) => void; clientName?: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !requestId) return;
    setLoading(true);
    supabase.from("wellness_request_events" as never)
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setEvents((data ?? []) as unknown as Event[]);
        setLoading(false);
      });
  }, [open, requestId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Audit timeline {clientName ? `· ${clientName}` : ""}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
            events.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No events recorded yet.</div> :
            events.map((e) => {
              const Icon = ICONS[e.action] ?? Clock;
              const ChanIcon = e.channel === "email" ? Mail : e.channel === "whatsapp" ? MessageCircle : e.channel === "call" ? Phone : null;
              return (
                <div key={e.id} className="flex gap-3 border rounded-md p-3">
                  <div className="mt-0.5"><Icon className="h-4 w-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm capitalize">{e.action.replaceAll("_", " ")}</span>
                      {ChanIcon && <ChanIcon className="h-3 w-3 text-muted-foreground" />}
                      <Badge variant={STATUS_VARIANT[e.status] ?? "outline"} className="text-[10px]">{e.status}</Badge>
                    </div>
                    {e.recipient && <div className="text-xs text-muted-foreground mt-0.5">{e.recipient}</div>}
                    {e.message && <div className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">{e.message}</div>}
                    <div className="text-[10px] text-muted-foreground mt-1 flex gap-3">
                      <span>{new Date(e.created_at).toLocaleString()}</span>
                      {e.delivered_at && <span className="text-emerald-600">Delivered {new Date(e.delivered_at).toLocaleTimeString()}</span>}
                      {e.opened_at && <span className="text-emerald-700">Opened {new Date(e.opened_at).toLocaleTimeString()}</span>}
                      {e.status === "failed" && <span className="text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" /> failed</span>}
                    </div>
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
  } as any);
}
