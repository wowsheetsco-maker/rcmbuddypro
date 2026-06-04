import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Req {
  id: string; corporate_id: string | null; package_id: string | null;
  client_name: string; client_email: string | null; client_phone: string | null;
  service_type: string | null;
  requested_at: string; scheduled_at: string | null; status: string;
  source: string; report_url: string | null; report_sent_at: string | null;
  confirmation_sent_at: string | null;
}
interface Corp { id: string; name: string }
interface Pkg { id: string; name: string; price: number }
interface Evt { request_id: string; action: string; status: string; channel: string | null; created_at: string; delivered_at: string | null }
interface InvItem { visit_id: string | null; invoice_id: string; amount: number }
interface Inv { id: string; status: string; invoice_no: string | null; total_amount: number | null }

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  confirmed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rescheduled: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  cancelled: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  completed: "bg-violet-500/10 text-violet-700 border-violet-500/20",
};

export default function WellnessCasesPage() {
  const [rows, setRows] = useState<Req[]>([]);
  const [corps, setCorps] = useState<Corp[]>([]);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [events, setEvents] = useState<Evt[]>([]);
  const [items, setItems] = useState<InvItem[]>([]);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [r, c, p, e, ii, iv] = await Promise.all([
        supabase.from("wellness_requests").select("*").order("requested_at", { ascending: false }).limit(1000),
        supabase.from("opd_corporates").select("id,name,billing_email").order("name"),
        supabase.from("wellness_packages").select("id,name,price"),
        supabase.from("wellness_request_events").select("request_id,action,status,channel,created_at,delivered_at").order("created_at", { ascending: false }).limit(1000),
        supabase.from("opd_invoice_items").select("visit_id,invoice_id,amount"),
        supabase.from("opd_invoices").select("id,status,invoice_number,total_amount"),
      ]);
      setRows((r.data ?? []) as Req[]);
      setCorps((c.data ?? []) as Corp[]);
      setPkgs((p.data ?? []) as Pkg[]);
      setEvents((e.data ?? []) as Evt[]);
      setItems((ii.data ?? []) as InvItem[]);
      setInvs((iv.data ?? []) as Inv[]);
      setLoading(false);
    })();
  }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c])), [corps]);
  const pkgMap = useMemo(() => new Map(pkgs.map((p) => [p.id, p])), [pkgs]);
  const invMap = useMemo(() => new Map(invs.map((i) => [i.id, i])), [invs]);
  const lastEventByReq = useMemo(() => {
    const m = new Map<string, Evt>();
    for (const ev of events) if (!m.has(ev.request_id)) m.set(ev.request_id, ev);
    return m;
  }, [events]);
  const invoiceByReq = useMemo(() => {
    const m = new Map<string, Inv>();
    for (const it of items) if (it.visit_id) {
      const inv = invMap.get(it.invoice_id);
      if (inv && !m.has(it.visit_id)) m.set(it.visit_id, inv);
    }
    return m;
  }, [items, invMap]);

  const enriched = rows.map((r) => {
    const pkg = r.package_id ? pkgMap.get(r.package_id) : null;
    return {
      ...r,
      provider: r.corporate_id ? corpMap.get(r.corporate_id)?.name ?? "—" : "—",
      packageName: pkg?.name ?? r.service_type ?? "—",
      amount: pkg?.price ?? 0,
      lastEvent: lastEventByReq.get(r.id) ?? null,
      invoice: invoiceByReq.get(r.id) ?? null,
    };
  });

  const filtered = enriched.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (providerFilter !== "all" && r.corporate_id !== providerFilter) return false;
    if (deliveryFilter !== "all") {
      const d = r.lastEvent?.status ?? "none";
      if (deliveryFilter === "delivered" && !r.lastEvent?.delivered_at) return false;
      if (deliveryFilter === "failed" && d !== "failed") return false;
      if (deliveryFilter === "pending" && (r.lastEvent?.delivered_at || d === "failed")) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.client_name} ${r.client_email ?? ""} ${r.client_phone ?? ""} ${r.provider} ${r.packageName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = {
    total: rows.length,
    new: rows.filter((r) => r.status === "new").length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    completed: rows.filter((r) => r.status === "completed").length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    invoiced: enriched.filter((r) => r.invoice).length,
  };

  const exportCSV = () => {
    const headers = ["Case ID","Client","Email","Phone","Provider","Package","Status","Requested","Scheduled","Source","Last Action","Delivery","Invoice #","Invoice Status","Amount"];
    const csv = [headers.join(",")].concat(
      filtered.map((r) => [
        r.id.slice(0, 8),
        r.client_name,
        r.client_email ?? "",
        r.client_phone ?? "",
        r.provider,
        r.packageName,
        r.status,
        r.requested_at,
        r.scheduled_at ?? "",
        r.source,
        r.lastEvent?.action ?? "",
        r.lastEvent?.delivered_at ? "delivered" : r.lastEvent?.status ?? "",
        r.invoice?.invoice_number ?? "",
        r.invoice?.status ?? "",
        r.amount,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `wellness-cases-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

  return (
    <AppLayout>
      <div className="space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display">All Cases</h1>
            <p className="text-sm text-muted-foreground">Master tracker for every wellness request — status, provider, schedule, invoice and last delivery.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
            <Link to={"/wellness/requests" as any}><Button variant="outline">Requests Inbox <ExternalLink className="h-4 w-4 ml-2" /></Button></Link>
          </div>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {[
            { label: "Total", value: counts.total },
            { label: "New", value: counts.new },
            { label: "Confirmed", value: counts.confirmed },
            { label: "Completed", value: counts.completed },
            { label: "Cancelled", value: counts.cancelled },
            { label: "Invoiced", value: counts.invoiced },
          ].map((s) => (
            <Card key={s.label}><CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-2xl font-semibold">{s.value}</div>
            </CardContent></Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input placeholder="Search name, email, phone, provider…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["new","confirmed","rescheduled","cancelled","completed"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
              <SelectTrigger><SelectValue placeholder="Delivery" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All deliveries</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Cases ({filtered.length})</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Last action</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No cases match your filters.</TableCell></TableRow>
                ) : filtered.map((r) => {
                  const delivery = r.lastEvent?.delivered_at
                    ? "delivered"
                    : r.lastEvent?.status === "failed"
                      ? "failed"
                      : r.lastEvent
                        ? "pending"
                        : "—";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.client_name}</div>
                        <div className="text-xs text-muted-foreground">{r.client_email ?? r.client_phone ?? "—"}</div>
                      </TableCell>
                      <TableCell>{r.provider}</TableCell>
                      <TableCell>{r.packageName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLORS[r.status] ?? ""}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{fmt(r.requested_at)}</TableCell>
                      <TableCell className="text-xs">{fmt(r.scheduled_at)}</TableCell>
                      <TableCell className="text-xs">
                        {r.lastEvent ? (
                          <div>
                            <div>{r.lastEvent.action}{r.lastEvent.channel ? ` · ${r.lastEvent.channel}` : ""}</div>
                            <div className="text-muted-foreground">{fmt(r.lastEvent.created_at)}</div>
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          delivery === "delivered" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                          : delivery === "failed" ? "bg-rose-500/10 text-rose-700 border-rose-500/20"
                          : delivery === "pending" ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
                          : ""
                        }>{delivery}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.invoice ? (
                          <div>
                            <div className="font-medium">{r.invoice.invoice_number ?? r.invoice.id.slice(0,8)}</div>
                            <div className="text-muted-foreground">{r.invoice.status}</div>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">{r.amount ? `₹${Number(r.amount).toLocaleString()}` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
