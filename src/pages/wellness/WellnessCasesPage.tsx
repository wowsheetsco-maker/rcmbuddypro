import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, ExternalLink, Save, Trash2, FileSpreadsheet, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { exportMonthlyInvoiceXlsx, type MonthlyCaseRow } from "@/lib/wellnessMonthlyExport";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WellnessRequestsBody } from "./WellnessRequestsPage";

interface Req {
  id: string; org_id: string; corporate_id: string | null; package_id: string | null;
  client_name: string; client_email: string | null; client_phone: string | null;
  service_type: string | null;
  requested_at: string; scheduled_at: string | null; status: string;
  source: string; report_url: string | null; report_sent_at: string | null;
  confirmation_sent_at: string | null;
}
interface Corp { id: string; name: string }
interface Pkg { id: string; name: string; price: number }
interface Evt { request_id: string; action: string; status: string; channel: string | null; created_at: string; delivered_at: string | null }
interface Inv { id: string; status: string; invoice_no: string | null; total_amount: number | null; period_start: string; period_end: string }
interface CaseInv { id: string; request_id: string; invoice_id: string; status: string; amount: number; period_month: string }
interface SavedView { id: string; name: string; filters: any; is_shared: boolean; user_id: string }

interface Filters {
  search: string;
  status: string;
  provider: string;
  packageId: string;
  delivery: string;
  invoiceState: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = {
  search: "", status: "all", provider: "all", packageId: "all",
  delivery: "all", invoiceState: "all", dateFrom: "", dateTo: "",
};

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  confirmed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  rescheduled: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  cancelled: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  completed: "bg-violet-500/10 text-violet-700 border-violet-500/20",
};

const LINK_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  invoiced: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  submitted: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20",
  paid: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  disputed: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  cancelled: "bg-muted text-muted-foreground border-muted",
};

const LINK_STATUSES = ["pending", "invoiced", "submitted", "paid", "disputed", "cancelled"];

export default function WellnessCasesPage() {
  const [rows, setRows] = useState<Req[]>([]);
  const [corps, setCorps] = useState<Corp[]>([]);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [events, setEvents] = useState<Evt[]>([]);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [caseInvs, setCaseInvs] = useState<CaseInv[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [activeViewId, setActiveViewId] = useState<string>("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewShared, setNewViewShared] = useState(false);
  const [exportMonth, setExportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [userId, setUserId] = useState<string>("");
  const [tab, setTab] = useState<"cases" | "inbox">("cases");

  const loadAll = async () => {
    setLoading(true);
    const { data: ud } = await supabase.auth.getUser();
    if (ud?.user?.id) setUserId(ud.user.id);
    const [r, c, p, e, iv, ci, sv] = await Promise.all([
      supabase.from("wellness_requests").select("*").order("requested_at", { ascending: false }).limit(1000),
      supabase.from("opd_corporates").select("id,name").order("name"),
      supabase.from("wellness_packages").select("id,name,price"),
      supabase.from("wellness_request_events").select("request_id,action,status,channel,created_at,delivered_at").order("created_at", { ascending: false }).limit(2000),
      supabase.from("opd_invoices").select("id,status,invoice_no,total_amount,period_start,period_end").order("period_start", { ascending: false }),
      supabase.from("wellness_case_invoices" as any).select("id,request_id,invoice_id,status,amount,period_month"),
      supabase.from("wellness_saved_views" as any).select("*").order("created_at", { ascending: false }),
    ]);
    setRows((r.data ?? []) as Req[]);
    setCorps((c.data ?? []) as Corp[]);
    setPkgs((p.data ?? []) as Pkg[]);
    setEvents((e.data ?? []) as Evt[]);
    setInvs((iv.data ?? []) as Inv[]);
    setCaseInvs(((ci.data as any) ?? []) as CaseInv[]);
    setViews(((sv.data as any) ?? []) as SavedView[]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c])), [corps]);
  const pkgMap = useMemo(() => new Map(pkgs.map((p) => [p.id, p])), [pkgs]);
  const invMap = useMemo(() => new Map(invs.map((i) => [i.id, i])), [invs]);
  const lastEventByReq = useMemo(() => {
    const m = new Map<string, Evt>();
    for (const ev of events) if (!m.has(ev.request_id)) m.set(ev.request_id, ev);
    return m;
  }, [events]);
  const caseInvByReq = useMemo(() => {
    const m = new Map<string, CaseInv>();
    for (const ci of caseInvs) if (!m.has(ci.request_id)) m.set(ci.request_id, ci);
    return m;
  }, [caseInvs]);

  const enriched = rows.map((r) => {
    const pkg = r.package_id ? pkgMap.get(r.package_id) : null;
    const link = caseInvByReq.get(r.id) ?? null;
    const inv = link ? invMap.get(link.invoice_id) ?? null : null;
    return {
      ...r,
      provider: r.corporate_id ? corpMap.get(r.corporate_id)?.name ?? "—" : "—",
      packageName: pkg?.name ?? r.service_type ?? "—",
      amount: link?.amount ?? pkg?.price ?? 0,
      lastEvent: lastEventByReq.get(r.id) ?? null,
      invoice: inv,
      caseInvoice: link,
    };
  });

  const filtered = enriched.filter((r) => {
    const f = filters;
    if (f.status !== "all" && r.status !== f.status) return false;
    if (f.provider !== "all" && r.corporate_id !== f.provider) return false;
    if (f.packageId !== "all" && r.package_id !== f.packageId) return false;
    if (f.delivery !== "all") {
      if (f.delivery === "delivered" && !r.lastEvent?.delivered_at) return false;
      if (f.delivery === "failed" && r.lastEvent?.status !== "failed") return false;
      if (f.delivery === "pending" && (r.lastEvent?.delivered_at || r.lastEvent?.status === "failed")) return false;
    }
    if (f.invoiceState !== "all") {
      const ls = r.caseInvoice?.status ?? "unlinked";
      if (f.invoiceState === "unlinked" && r.caseInvoice) return false;
      if (f.invoiceState !== "unlinked" && ls !== f.invoiceState) return false;
    }
    if (f.dateFrom && r.requested_at < f.dateFrom) return false;
    if (f.dateTo && r.requested_at > f.dateTo + "T23:59:59") return false;
    if (f.search) {
      const q = f.search.toLowerCase();
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
    invoiced: enriched.filter((r) => r.caseInvoice && r.caseInvoice.status !== "pending").length,
  };

  // ---- Saved views
  const saveView = async () => {
    if (!newViewName.trim()) { toast.error("View name is required"); return; }
    const orgId = rows[0]?.org_id;
    if (!orgId) { toast.error("No org context"); return; }
    const { data, error } = await supabase.from("wellness_saved_views" as any).insert({
      org_id: orgId, name: newViewName.trim(), filters, is_shared: newViewShared,
    } as any).select().single();
    if (error) { toast.error(error.message); return; }
    setViews((v) => [data as any, ...v]);
    setActiveViewId((data as any).id);
    setSaveOpen(false);
    setNewViewName("");
    setNewViewShared(false);
    toast.success("View saved");
  };

  const applyView = (id: string) => {
    setActiveViewId(id);
    if (!id) { setFilters(EMPTY_FILTERS); return; }
    const v = views.find((x) => x.id === id);
    if (v) setFilters({ ...EMPTY_FILTERS, ...(v.filters as Filters) });
  };

  const deleteView = async (id: string) => {
    if (!confirm("Delete this saved view?")) return;
    const { error } = await supabase.from("wellness_saved_views" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setViews((v) => v.filter((x) => x.id !== id));
    if (activeViewId === id) { setActiveViewId(""); setFilters(EMPTY_FILTERS); }
    toast.success("View deleted");
  };

  // ---- Invoice workflow
  const updateLinkStatus = async (caseInvoiceId: string, status: string) => {
    const { error } = await supabase.from("wellness_case_invoices" as any).update({ status } as any).eq("id", caseInvoiceId);
    if (error) { toast.error(error.message); return; }
    setCaseInvs((cs) => cs.map((c) => c.id === caseInvoiceId ? { ...c, status } : c));
    toast.success("Status updated");
  };

  // ---- Exports
  const exportCSV = () => {
    const headers = ["Case ID","Client","Email","Phone","Provider","Package","Status","Requested","Scheduled","Last Action","Delivery","Invoice #","Invoice Status","Link Status","Amount"];
    const csv = [headers.join(",")].concat(
      filtered.map((r) => [
        r.id.slice(0, 8), r.client_name, r.client_email ?? "", r.client_phone ?? "",
        r.provider, r.packageName, r.status, r.requested_at, r.scheduled_at ?? "",
        r.lastEvent?.action ?? "",
        r.lastEvent?.delivered_at ? "delivered" : r.lastEvent?.status ?? "",
        r.invoice?.invoice_no ?? "", r.invoice?.status ?? "",
        r.caseInvoice?.status ?? "unlinked", r.amount,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `wellness-cases-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportMonthly = () => {
    const [y, m] = exportMonth.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    const monthRows: MonthlyCaseRow[] = enriched
      .filter((r) => {
        const t = new Date(r.requested_at);
        return t >= start && t < end;
      })
      .map((r) => ({
        case_id: r.id, client_name: r.client_name,
        client_email: r.client_email, client_phone: r.client_phone,
        provider: r.provider, package: r.packageName, status: r.status,
        requested_at: r.requested_at, scheduled_at: r.scheduled_at,
        amount: Number(r.amount) || 0,
        invoice_no: r.invoice?.invoice_no, invoice_status: r.invoice?.status,
        link_status: r.caseInvoice?.status ?? "pending",
      }));
    if (monthRows.length === 0) { toast.error("No cases in this month"); return; }
    exportMonthlyInvoiceXlsx(exportMonth, monthRows);
    toast.success(`Exported ${monthRows.length} cases for ${exportMonth}`);
  };

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const setF = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <AppLayout>
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-display">Wellness Cases</h1>
            <p className="text-sm text-muted-foreground">Inbox for new requests + master tracker for every case.</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "cases" | "inbox")}>
              <TabsList>
                <TabsTrigger value="inbox">Inbox{counts.new ? ` (${counts.new})` : ""}</TabsTrigger>
                <TabsTrigger value="cases">All Cases</TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === "cases" && (<>
              <Input type="month" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} className="w-[150px]" />
              <Button variant="outline" onClick={exportMonthly}><FileSpreadsheet className="h-4 w-4 mr-2" />Monthly Export</Button>
              <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />CSV</Button>
            </>)}
          </div>
        </header>

        {tab === "inbox" && <WellnessRequestsBody />}
        {tab === "cases" && (<>



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
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Filters</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={activeViewId || "none"} onValueChange={(v) => applyView(v === "none" ? "" : v)}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Saved views" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No saved view —</SelectItem>
                  {views.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}{v.is_shared ? " (shared)" : ""}{v.user_id !== userId ? " • org" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeViewId && views.find((v) => v.id === activeViewId)?.user_id === userId && (
                <Button variant="ghost" size="icon" onClick={() => deleteView(activeViewId)} title="Delete view">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm"><Save className="h-4 w-4 mr-2" />Save view</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Save current filters as a view</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>View name</Label>
                      <Input value={newViewName} onChange={(e) => setNewViewName(e.target.value)} placeholder="e.g. Acme — Pending invoices" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="shared" checked={newViewShared} onCheckedChange={(c) => setNewViewShared(!!c)} />
                      <Label htmlFor="shared" className="cursor-pointer">Share with org</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setSaveOpen(false)}>Cancel</Button>
                    <Button onClick={saveView}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="ghost" size="sm" onClick={() => { setFilters(EMPTY_FILTERS); setActiveViewId(""); }}>Clear</Button>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input placeholder="Search name, email, phone…" value={filters.search} onChange={(e) => setF({ search: e.target.value })} />
            <Select value={filters.status} onValueChange={(v) => setF({ status: v })}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["new","confirmed","rescheduled","cancelled","completed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.provider} onValueChange={(v) => setF({ provider: v })}>
              <SelectTrigger><SelectValue placeholder="Provider" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.packageId} onValueChange={(v) => setF({ packageId: v })}>
              <SelectTrigger><SelectValue placeholder="Package" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All packages</SelectItem>
                {pkgs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.delivery} onValueChange={(v) => setF({ delivery: v })}>
              <SelectTrigger><SelectValue placeholder="Delivery" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All deliveries</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.invoiceState} onValueChange={(v) => setF({ invoiceState: v })}>
              <SelectTrigger><SelectValue placeholder="Invoice state" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All invoice states</SelectItem>
                <SelectItem value="unlinked">Unlinked</SelectItem>
                {LINK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={filters.dateFrom} onChange={(e) => setF({ dateFrom: e.target.value })} placeholder="From" />
            <Input type="date" value={filters.dateTo} onChange={(e) => setF({ dateTo: e.target.value })} placeholder="To" />
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
                  <TableHead>Last action</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Workflow</TableHead>
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
                    ? "delivered" : r.lastEvent?.status === "failed" ? "failed"
                    : r.lastEvent ? "pending" : "—";
                  const linkStatus = r.caseInvoice?.status ?? "unlinked";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.client_name}</div>
                        <div className="text-xs text-muted-foreground">{r.client_email ?? r.client_phone ?? "—"}</div>
                      </TableCell>
                      <TableCell>{r.provider}</TableCell>
                      <TableCell>{r.packageName}</TableCell>
                      <TableCell><Badge variant="outline" className={STATUS_COLORS[r.status] ?? ""}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{fmt(r.requested_at)}</TableCell>
                      <TableCell className="text-xs">
                        {r.lastEvent ? (<div>
                          <div>{r.lastEvent.action}{r.lastEvent.channel ? ` · ${r.lastEvent.channel}` : ""}</div>
                          <div className="text-muted-foreground">{fmt(r.lastEvent.created_at)}</div>
                        </div>) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          delivery === "delivered" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                          : delivery === "failed" ? "bg-rose-500/10 text-rose-700 border-rose-500/20"
                          : delivery === "pending" ? "bg-amber-500/10 text-amber-700 border-amber-500/20" : ""
                        }>{delivery}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.invoice ? (<div>
                          <div className="font-medium">{r.invoice.invoice_no ?? r.invoice.id.slice(0,8)}</div>
                          <div className="text-muted-foreground">{r.invoice.status}</div>
                        </div>) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {r.caseInvoice ? (
                          <Select value={linkStatus} onValueChange={(v) => updateLinkStatus(r.caseInvoice!.id, v)}>
                            <SelectTrigger className="h-7 w-[120px] text-xs">
                              <Badge variant="outline" className={LINK_STATUS_COLORS[linkStatus] ?? ""}>{linkStatus}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {LINK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground"><Package className="h-3 w-3 mr-1" />unlinked</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{r.amount ? `₹${Number(r.amount).toLocaleString()}` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </>)}
      </div>
    </AppLayout>
  );
}
