import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";
import {
  DEFAULTS, renderTemplate, loadTemplates, invalidateTemplateCache,
  type TemplateKind, type TemplateChannel,
} from "@/lib/wellnessMessaging";
import { RotateCcw, Save, Mail, MessageCircle, Eye } from "lucide-react";

const KINDS: { key: TemplateKind; label: string; desc: string }[] = [
  { key: "confirm", label: "Confirmation", desc: "Sent when you confirm a new request." },
  { key: "reschedule", label: "Reschedule", desc: "Sent when you change the scheduled time." },
  { key: "cancel", label: "Cancellation", desc: "Sent when a request is cancelled." },
  { key: "report", label: "Report ready", desc: "Sent when the consultation/health-check report is uploaded." },
];

const PLACEHOLDERS = ["{client_name}", "{provider_name}", "{service_name}", "{scheduled_at}", "{report_url}"];

interface Row { kind: TemplateKind; channel: TemplateChannel; subject: string; body: string }
interface Corp { id: string; name: string }
interface Pkg { id: string; name: string; corporate_id: string }

export default function WellnessTemplatesPage() {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);
  const [activeKind, setActiveKind] = useState<TemplateKind>("confirm");

  // Preview state
  const [corps, setCorps] = useState<Corp[]>([]);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [previewCorpId, setPreviewCorpId] = useState<string>("");
  const [previewPkgId, setPreviewPkgId] = useState<string>("");
  const [previewClient, setPreviewClient] = useState("Priya Sharma");
  const [previewWhen, setPreviewWhen] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  const [previewUrl, setPreviewUrl] = useState("https://example.com/report.pdf");

  const load = async () => {
    setLoading(true);
    const [t, c, p] = await Promise.all([
      supabase.from("wellness_message_templates" as never).select("kind,channel,subject,body"),
      supabase.from("opd_corporates").select("id,name").order("name"),
      supabase.from("wellness_packages").select("id,name,corporate_id").eq("is_active", true).order("name"),
    ]);
    const map: Record<string, Row> = {};
    for (const k of KINDS) for (const ch of ["email", "whatsapp"] as TemplateChannel[]) {
      const existing = (t.data as any[] | null)?.find((r) => r.kind === k.key && r.channel === ch);
      map[`${k.key}:${ch}`] = {
        kind: k.key, channel: ch,
        subject: existing?.subject ?? DEFAULTS[k.key][ch].subject,
        body: existing?.body ?? DEFAULTS[k.key][ch].body,
      };
    }
    setRows(map);
    setCorps((c.data ?? []) as Corp[]);
    setPkgs((p.data ?? []) as Pkg[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filteredPkgs = useMemo(
    () => previewCorpId ? pkgs.filter((p) => p.corporate_id === previewCorpId) : pkgs,
    [pkgs, previewCorpId]
  );

  const previewCtx = useMemo(() => {
    const provider = corps.find((c) => c.id === previewCorpId);
    const pkg = pkgs.find((p) => p.id === previewPkgId);
    return {
      clientName: previewClient || "Client",
      providerName: provider?.name,
      serviceName: pkg?.name ?? "consultation",
      scheduledAt: previewWhen ? new Date(previewWhen).toISOString() : null,
      reportUrl: previewUrl,
    };
  }, [corps, pkgs, previewCorpId, previewPkgId, previewClient, previewWhen, previewUrl]);

  // Build a templates map from the in-memory editor rows so preview reflects unsaved edits.
  const liveTemplates = useMemo(() => {
    const map: Record<string, { subject: string | null; body: string }> = {};
    for (const r of Object.values(rows)) map[`${r.kind}:${r.channel}`] = { subject: r.subject || null, body: r.body };
    return map as any;
  }, [rows]);

  const save = async (r: Row) => {
    const orgId = getCurrentOrgId();
    const { error } = await supabase.from("wellness_message_templates" as never).upsert({
      org_id: orgId, kind: r.kind, channel: r.channel,
      subject: r.subject || null, body: r.body,
    } as any, { onConflict: "org_id,kind,channel" });
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    invalidateTemplateCache();
    toast({ title: "Template saved" });
  };

  const reset = (key: string) => {
    const [kind, channel] = key.split(":") as [TemplateKind, TemplateChannel];
    const def = DEFAULTS[kind][channel];
    setRows((m) => ({ ...m, [key]: { kind, channel, subject: def.subject, body: def.body } }));
    toast({ title: "Reverted to default (not yet saved)" });
  };

  const previewEmail = renderTemplate(activeKind, "email", previewCtx, liveTemplates);
  const previewWa = renderTemplate(activeKind, "whatsapp", previewCtx, liveTemplates);

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-display">Message Templates</h1>
          <p className="text-sm text-muted-foreground">
            Customize the confirmation, reschedule, cancel, and report messages used when notifying clients.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Placeholders</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {PLACEHOLDERS.map((p) => (
              <Badge key={p} variant="outline" className="font-mono text-xs">{p}</Badge>
            ))}
            <p className="text-xs text-muted-foreground w-full mt-2">
              These are replaced with request data when the message is sent. Empty subjects on WhatsApp templates are fine.
            </p>
          </CardContent>
        </Card>

        {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> :
          <Tabs value={activeKind} onValueChange={(v) => setActiveKind(v as TemplateKind)} className="w-full">
            <TabsList>
              {KINDS.map((k) => <TabsTrigger key={k.key} value={k.key}>{k.label}</TabsTrigger>)}
            </TabsList>
            {KINDS.map((k) => (
              <TabsContent key={k.key} value={k.key} className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">{k.desc}</p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {(["email", "whatsapp"] as TemplateChannel[]).map((channel) => {
                    const key = `${k.key}:${channel}`;
                    const r = rows[key];
                    if (!r) return null;
                    return (
                      <Card key={key}>
                        <CardHeader className="flex flex-row items-center justify-between">
                          <CardTitle className="text-sm capitalize flex items-center gap-2">
                            {channel === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                            {channel}
                          </CardTitle>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => reset(key)}><RotateCcw className="h-3 w-3 mr-1" /> Default</Button>
                            <Button size="sm" onClick={() => save(r)}><Save className="h-3 w-3 mr-1" /> Save</Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {channel === "email" && (
                            <div>
                              <Label className="text-xs">Subject</Label>
                              <Input value={r.subject} onChange={(e) => setRows((m) => ({ ...m, [key]: { ...r, subject: e.target.value } }))} />
                            </div>
                          )}
                          <div>
                            <Label className="text-xs">Body</Label>
                            <Textarea rows={10} value={r.body} onChange={(e) => setRows((m) => ({ ...m, [key]: { ...r, body: e.target.value } }))} />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Live preview panel */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Eye className="h-4 w-4" /> Live preview — {k.label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                      <div>
                        <Label className="text-xs">Provider</Label>
                        <Select value={previewCorpId} onValueChange={(v) => { setPreviewCorpId(v); setPreviewPkgId(""); }}>
                          <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                          <SelectContent>
                            {corps.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Package / service</Label>
                        <Select value={previewPkgId} onValueChange={setPreviewPkgId}>
                          <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                          <SelectContent>
                            {filteredPkgs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Client name</Label>
                        <Input value={previewClient} onChange={(e) => setPreviewClient(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Scheduled at</Label>
                        <Input type="datetime-local" value={previewWhen} onChange={(e) => setPreviewWhen(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Report URL</Label>
                        <Input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="border rounded-md p-3 bg-muted/30">
                        <div className="flex items-center gap-2 text-xs font-medium mb-2">
                          <Mail className="h-3 w-3" /> Email preview
                        </div>
                        <div className="text-xs"><span className="text-muted-foreground">Subject:</span> {previewEmail.subject || <em className="text-muted-foreground">(none)</em>}</div>
                        <pre className="text-xs whitespace-pre-wrap mt-2 font-sans">{previewEmail.body}</pre>
                      </div>
                      <div className="border rounded-md p-3 bg-muted/30">
                        <div className="flex items-center gap-2 text-xs font-medium mb-2">
                          <MessageCircle className="h-3 w-3" /> WhatsApp preview
                        </div>
                        <pre className="text-xs whitespace-pre-wrap font-sans">{previewWa.body}</pre>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Preview uses your unsaved edits above so you can fine-tune before saving.</p>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        }
      </div>
    </AppLayout>
  );
}
