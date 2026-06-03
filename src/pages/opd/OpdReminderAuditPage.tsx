import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  id: string;
  beneficiary_name: string;
  provider: string | null;
  scheduled_at: string;
  status: string;
  reminder_24h_sent_at: string | null;
  reminder_same_day_sent_at: string | null;
  provider_confirmed_at: string | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function deliveryStatus(r: Row): { label: string; tone: string } {
  if (r.provider_confirmed_at) return { label: "Confirmed", tone: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" };
  if (r.status === "cancelled") return { label: "Cancelled", tone: "bg-muted text-muted-foreground" };
  if (r.reminder_same_day_sent_at) return { label: "Same-day sent · awaiting confirm", tone: "bg-amber-500/15 text-amber-700 border-amber-500/30" };
  if (r.reminder_24h_sent_at) return { label: "24h sent · awaiting confirm", tone: "bg-blue-500/15 text-blue-700 border-blue-500/30" };
  return { label: "Not yet flagged", tone: "bg-muted text-muted-foreground" };
}

export default function OpdReminderAuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "24h" | "same_day" | "confirmed" | "pending">("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("opd_appointments")
      .select("id,beneficiary_name,provider,scheduled_at,status,reminder_24h_sent_at,reminder_same_day_sent_at,provider_confirmed_at")
      .or("reminder_24h_sent_at.not.is.null,reminder_same_day_sent_at.not.is.null")
      .order("scheduled_at", { ascending: false })
      .limit(500);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !`${r.beneficiary_name} ${r.provider ?? ""}`.toLowerCase().includes(term)) return false;
      if (filter === "24h" && !r.reminder_24h_sent_at) return false;
      if (filter === "same_day" && !r.reminder_same_day_sent_at) return false;
      if (filter === "confirmed" && !r.provider_confirmed_at) return false;
      if (filter === "pending" && r.provider_confirmed_at) return false;
      return true;
    });
  }, [rows, q, filter]);

  const counts = {
    sent24: rows.filter((r) => r.reminder_24h_sent_at).length,
    sentSame: rows.filter((r) => r.reminder_same_day_sent_at).length,
    confirmed: rows.filter((r) => r.provider_confirmed_at).length,
    pending: rows.filter((r) => !r.provider_confirmed_at && r.status !== "cancelled").length,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Provider reminder audit log</h1>
            <p className="text-sm text-muted-foreground">
              Every appointment for which a 24-hour or same-day provider-confirmation reminder was flagged, with delivery status.
              Updated automatically by the reminder cron every 15 minutes.
            </p>
          </div>
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">24h reminders sent</div><div className="text-2xl font-semibold text-blue-600">{counts.sent24}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Same-day reminders sent</div><div className="text-2xl font-semibold text-amber-600">{counts.sentSame}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Confirmed by provider</div><div className="text-2xl font-semibold text-emerald-600">{counts.confirmed}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Still pending confirm</div><div className="text-2xl font-semibold text-red-600">{counts.pending}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Reminder events ({filtered.length})</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Search beneficiary / provider" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
              <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  <SelectItem value="24h">24h reminder sent</SelectItem>
                  <SelectItem value="same_day">Same-day reminder sent</SelectItem>
                  <SelectItem value="confirmed">Provider confirmed</SelectItem>
                  <SelectItem value="pending">Still pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No reminder events match.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Beneficiary</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>24h reminder</TableHead>
                    <TableHead>Same-day reminder</TableHead>
                    <TableHead>Confirmed at</TableHead>
                    <TableHead>Delivery status</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const d = deliveryStatus(r);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.beneficiary_name}</TableCell>
                          <TableCell>{r.provider ?? "—"}</TableCell>
                          <TableCell className="text-xs tabular-nums">{fmt(r.scheduled_at)}</TableCell>
                          <TableCell className="text-xs tabular-nums">{fmt(r.reminder_24h_sent_at)}</TableCell>
                          <TableCell className="text-xs tabular-nums">{fmt(r.reminder_same_day_sent_at)}</TableCell>
                          <TableCell className="text-xs tabular-nums">{fmt(r.provider_confirmed_at)}</TableCell>
                          <TableCell><Badge className={d.tone} variant="outline">{d.label}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
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
