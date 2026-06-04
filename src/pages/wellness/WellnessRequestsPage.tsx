import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Mail, MessageCircle, Phone, Upload, CheckCircle2, XCircle, CalendarClock, Inbox, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";
import {
  renderTemplate, loadTemplates, mailto, whatsappLink, telLink,
  type TemplateKind,
} from "@/lib/wellnessMessaging";
import { WellnessRequestTimeline, logWellnessEvent } from "@/components/WellnessRequestTimeline";

const STATUSES = ["new", "confirmed", "rescheduled", "cancelled", "completed"];

interface Req {
  id: string; corporate_id: string | null; package_id: string | null;
  client_name: string; client_email: string | null; client_phone: string | null;
  service_type: string | null;
  requested_at: string; scheduled_at: string | null; status: string;
  source: string; source_subject: string | null;
  report_url: string | null; report_sent_at: string | null;
  confirmation_sent_at: string | null; notes: string | null;
}
interface Corp { id: string; name: string }
interface Pkg { id: string; name: string; corporate_id: string; service_type: string; price: number }

export default function WellnessRequestsPage() {
  const [rows, setRows] = useState<Req[]>([]);
  const [corps, setCorps] = useState<Corp[]>([]);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [timelineFor, setTimelineFor] = useState<{ id: string; name: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [r, c, p] = await Promise.all([
      supabase.from("wellness_requests").select("*").order("requested_at", { ascending: false }).limit(500),
      supabase.from("opd_corporates").select("id,name").order("name"),
      supabase.from("wellness_packages").select("id,name,corporate_id,service_type,price").eq("is_active", true).order("name"),
    ]);
    setRows((r.data ?? []) as Req[]);
    setCorps((c.data ?? []) as Corp[]);
    setPkgs((p.data ?? []) as Pkg[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const corpMap = useMemo(() => new Map(corps.map((c) => [c.id, c.name])), [corps]);
  const pkgMap = useMemo(() => new Map(pkgs.map((p) => [p.id, p])), [pkgs]);

  const filtered = rows.filter((r) =>
    (statusFilter === "all" || r.status === statusFilter) &&
    (!search || `${r.client_name} ${r.client_email ?? ""} ${r.client_phone ?? ""}`.toLowerCase().includes(search.toLowerCase()))
  );

  const counts = {
    new: rows.filter((r) => r.status === "new").length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    completed: rows.filter((r) => r.status === "completed").length,
  };

  const updateStatus = async (id: string, status: string, extra: Partial<Req> = {}) => {
    const { error } = await supabase.from("wellness_requests").update({ status, ...extra } as any).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <header className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display">Requests Inbox</h1>
            <p className="text-sm text-muted-foreground">New requests from email, web form, or manual entry. Confirm, reschedule, cancel, then send report.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => toast({ title: "Gmail connector not linked yet", description: "Open Connectors → Google Mail to enable email intake." })}>
              <Inbox className="h-4 w-4 mr-1" /> Connect Gmail
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> New request</Button></DialogTrigger>
              <NewRequestDialog corps={corps} pkgs={pkgs} onSaved={() => { setOpen(false); load(); }} />
            </Dialog>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">New / awaiting action</div><div className="text-2xl font-semibold">{counts.new}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Confirmed (upcoming)</div><div className="text-2xl font-semibold">{counts.confirmed}</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Completed</div><div className="text-2xl font-semibold">{counts.completed}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">Requests ({filtered.length})</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="Search client" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
              filtered.length === 0 ? <div className="text-sm text-muted-foreground py-8 text-center">No requests. Add one or connect Gmail to auto-import.</div> :
              <div className="overflow-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Received</TableHead><TableHead>Client</TableHead>
                    <TableHead>Provider / Package</TableHead><TableHead>Scheduled</TableHead>
                    <TableHead>Status</TableHead><TableHead>Source</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const pkg = r.package_id ? pkgMap.get(r.package_id) : undefined;
                      const provider = r.corporate_id ? corpMap.get(r.corporate_id) : undefined;
                      const ctx = {
                        clientName: r.client_name,
                        providerName: provider,
                        serviceName: pkg?.name ?? r.service_type ?? undefined,
                        scheduledAt: r.scheduled_at,
                        reportUrl: r.report_url,
                      };
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs whitespace-nowrap">{new Date(r.requested_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="font-medium">{r.client_name}</div>
                            <div className="text-xs text-muted-foreground">{r.client_email ?? ""} {r.client_phone ? `· ${r.client_phone}` : ""}</div>
                          </TableCell>
                          <TableCell className="text-xs">{provider ?? "—"}<div className="text-muted-foreground">{pkg?.name ?? r.service_type ?? ""}</div></TableCell>
                          <TableCell className="text-xs">{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "—"}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "completed" ? "default" : r.status === "cancelled" ? "destructive" : "outline"}>{r.status}</Badge>
                            {r.confirmation_sent_at && <div className="text-[10px] text-muted-foreground mt-1">msg sent</div>}
                          </TableCell>
                          <TableCell className="text-xs capitalize">{r.source}</TableCell>
                          <TableCell className="text-right">
                            <RowActions req={r} ctx={ctx} onChange={load} updateStatus={updateStatus} onTimeline={() => setTimelineFor({ id: r.id, name: r.client_name })} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            }
          </CardContent>
        </Card>
        <WellnessRequestTimeline
          requestId={timelineFor?.id ?? null}
          clientName={timelineFor?.name}
          open={!!timelineFor}
          onOpenChange={(v) => !v && setTimelineFor(null)}
        />
      </div>
    </AppLayout>
  );
}

function RowActions({
  req, ctx, onChange, updateStatus, onTimeline,
}: {
  req: Req;
  ctx: { clientName: string; providerName?: string; serviceName?: string; scheduledAt?: string | null; reportUrl?: string | null };
  onChange: () => void;
  updateStatus: (id: string, status: string, extra?: Partial<Req>) => Promise<void>;
  onTimeline: () => void;
}) {
  const [schedOpen, setSchedOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const sendMessages = async (kind: TemplateKind) => {
    const templates = await loadTemplates();
    const orgId = getCurrentOrgId();
    const email = renderTemplate(kind, "email", ctx, templates);
    const wa = renderTemplate(kind, "whatsapp", ctx, templates);
    if (req.client_email) {
      window.open(mailto(req.client_email, email.subject, email.body), "_blank");
      await logWellnessEvent({
        orgId, requestId: req.id, action: "email_sent", channel: "email",
        status: "drafted", recipient: req.client_email, message: `${email.subject}\n\n${email.body}`,
        meta: { kind },
      });
    }
    if (req.client_phone) {
      window.open(whatsappLink(req.client_phone, wa.body), "_blank");
      await logWellnessEvent({
        orgId, requestId: req.id, action: "whatsapp_sent", channel: "whatsapp",
        status: "drafted", recipient: req.client_phone, message: wa.body,
        meta: { kind },
      });
    }
  };

  return (
    <div className="flex items-center justify-end gap-1 flex-wrap">
      <Button size="sm" variant="ghost" className="h-7 px-2" title="Timeline" onClick={onTimeline}>
        <History className="h-3 w-3" />
      </Button>
      {req.client_phone && (
        <a href={telLink(req.client_phone)} onClick={() => logWellnessEvent({ orgId: getCurrentOrgId(), requestId: req.id, action: "call_logged", channel: "call", status: "logged", recipient: req.client_phone })}>
          <Button size="sm" variant="ghost" className="h-7 px-2" title="Call client"><Phone className="h-3 w-3" /></Button>
        </a>
      )}
      {req.client_email && (
        <a href={mailto(req.client_email, "Regarding your wellness request", `Hi ${req.client_name},\n\n`)} target="_blank" rel="noreferrer">
          <Button size="sm" variant="ghost" className="h-7 px-2" title="Email client"><Mail className="h-3 w-3" /></Button>
        </a>
      )}
      {req.client_phone && (
        <a href={whatsappLink(req.client_phone, `Hi ${req.client_name}, `)} target="_blank" rel="noreferrer">
          <Button size="sm" variant="ghost" className="h-7 px-2" title="WhatsApp client"><MessageCircle className="h-3 w-3" /></Button>
        </a>
      )}

      {req.status !== "completed" && req.status !== "cancelled" && (
        <>
          <Button size="sm" variant="outline" className="h-7" onClick={async () => {
            await sendMessages("confirm");
            await updateStatus(req.id, "confirmed", { confirmation_sent_at: new Date().toISOString() as any });
            await logWellnessEvent({ orgId: getCurrentOrgId(), requestId: req.id, action: "confirmed", status: "logged" });
          }}>
            <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm
          </Button>
          <Dialog open={schedOpen} onOpenChange={setSchedOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7"><CalendarClock className="h-3 w-3 mr-1" /> Reschedule</Button>
            </DialogTrigger>
            <RescheduleDialog req={req} ctx={ctx} sendMessages={() => sendMessages("reschedule")} onDone={() => { setSchedOpen(false); onChange(); }} />
          </Dialog>
          <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={async () => {
            if (!confirm("Cancel this request and notify client?")) return;
            await sendMessages("cancel");
            await updateStatus(req.id, "cancelled");
            await logWellnessEvent({ orgId: getCurrentOrgId(), requestId: req.id, action: "cancelled", status: "logged" });
          }}>
            <XCircle className="h-3 w-3 mr-1" /> Cancel
          </Button>
        </>
      )}

      {(req.status === "confirmed" || req.status === "completed") && (
        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7"><Upload className="h-3 w-3 mr-1" /> Send report</Button>
          </DialogTrigger>
          <ReportDialog req={req} ctx={ctx} onDone={() => { setReportOpen(false); onChange(); }} />
        </Dialog>
      )}
    </div>
  );
}

function RescheduleDialog({ req, sendMessages, onDone }: { req: Req; ctx: any; sendMessages: () => void; onDone: () => void }) {
  const [when, setWhen] = useState(req.scheduled_at ? req.scheduled_at.slice(0, 16) : new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const submit = async () => {
    const iso = new Date(when).toISOString();
    const { error } = await supabase.from("wellness_requests").update({
      scheduled_at: iso, status: "rescheduled", confirmation_sent_at: new Date().toISOString(),
    }).eq("id", req.id);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    sendMessages();
    await logWellnessEvent({ orgId: getCurrentOrgId(), requestId: req.id, action: "rescheduled", status: "logged", meta: { scheduled_at: iso } });
    toast({ title: "Rescheduled, message drafts opened" });
    onDone();
  };
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Reschedule {req.client_name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>New date / time</Label><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">Saving will open prefilled email + WhatsApp drafts to send to the client.</p>
      </div>
      <DialogFooter><Button onClick={submit}>Reschedule &amp; notify</Button></DialogFooter>
    </DialogContent>
  );
}

function ReportDialog({ req, ctx, onDone }: { req: Req; ctx: any; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const submit = async () => {
    if (!file) return toast({ title: "Choose a file", variant: "destructive" });
    setUploading(true);
    const orgId = getCurrentOrgId();
    const path = `${orgId}/${req.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("wellness-reports").upload(path, file, { upsert: false });
    if (upErr) { setUploading(false); return toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); }
    const { data: signed } = await supabase.storage.from("wellness-reports").createSignedUrl(path, 60 * 60 * 24 * 30);
    const url = signed?.signedUrl ?? "";
    const { error } = await supabase.from("wellness_requests").update({
      report_url: url, report_sent_at: new Date().toISOString(), status: "completed",
    }).eq("id", req.id);
    setUploading(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });

    const templates = await loadTemplates();
    const ctx2 = { ...ctx, reportUrl: url };
    const email = renderTemplate("report", "email", ctx2, templates);
    const wa = renderTemplate("report", "whatsapp", ctx2, templates);
    if (req.client_email) {
      window.open(mailto(req.client_email, email.subject, email.body), "_blank");
      await logWellnessEvent({ orgId, requestId: req.id, action: "email_sent", channel: "email", status: "drafted", recipient: req.client_email, message: `${email.subject}\n\n${email.body}`, meta: { kind: "report" } });
    }
    if (req.client_phone) {
      window.open(whatsappLink(req.client_phone, wa.body), "_blank");
      await logWellnessEvent({ orgId, requestId: req.id, action: "whatsapp_sent", channel: "whatsapp", status: "drafted", recipient: req.client_phone, message: wa.body, meta: { kind: "report" } });
    }
    await logWellnessEvent({ orgId, requestId: req.id, action: "report_sent", status: "logged", meta: { url } });
    toast({ title: "Report uploaded & message drafts opened" });
    onDone();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Send report to {req.client_name}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Report file (PDF / image)</Label><Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <p className="text-xs text-muted-foreground">A 30-day shareable link will be generated and inserted into the email + WhatsApp draft.</p>
      </div>
      <DialogFooter><Button onClick={submit} disabled={uploading}>{uploading ? "Uploading…" : "Upload & send"}</Button></DialogFooter>
    </DialogContent>
  );
}

function NewRequestDialog({ corps, pkgs, onSaved }: { corps: Corp[]; pkgs: Pkg[]; onSaved: () => void }) {
  const [f, setF] = useState({
    client_name: "", client_email: "", client_phone: "",
    corporate_id: "", package_id: "", service_type: "consultation",
    scheduled_at: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const filteredPkgs = pkgs.filter((p) => !f.corporate_id || p.corporate_id === f.corporate_id);

  const submit = async () => {
    if (!f.client_name) return toast({ title: "Client name required", variant: "destructive" });
    setSaving(true);
    const orgId = getCurrentOrgId();
    const { data: inserted, error } = await supabase.from("wellness_requests").insert({
      org_id: orgId,
      client_name: f.client_name,
      client_email: f.client_email || null,
      client_phone: f.client_phone || null,
      corporate_id: f.corporate_id || null,
      package_id: f.package_id || null,
      service_type: f.service_type,
      scheduled_at: f.scheduled_at ? new Date(f.scheduled_at).toISOString() : null,
      notes: f.notes || null,
      source: "manual",
      status: "new",
    }).select("id").single();
    setSaving(false);
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    if (inserted?.id) await logWellnessEvent({ orgId, requestId: inserted.id, action: "created", status: "logged", meta: { source: "manual" } });
    toast({ title: "Request added" });
    onSaved();
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New request</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Client name *</Label><Input value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={f.client_phone} onChange={(e) => setF({ ...f, client_phone: e.target.value })} /></div>
        </div>
        <div><Label>Email</Label><Input type="email" value={f.client_email} onChange={(e) => setF({ ...f, client_email: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Provider</Label>
            <Select value={f.corporate_id} onValueChange={(v) => setF({ ...f, corporate_id: v, package_id: "" })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Package</Label>
            <Select value={f.package_id} onValueChange={(v) => setF({ ...f, package_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{filteredPkgs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Preferred date / time</Label><Input type="datetime-local" value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} /></div>
        <div><Label>Notes</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
