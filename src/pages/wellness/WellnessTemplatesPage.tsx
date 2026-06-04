import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { toast } from "@/hooks/use-toast";
import { DEFAULTS, type TemplateKind, type TemplateChannel, invalidateTemplateCache } from "@/lib/wellnessMessaging";
import { RotateCcw, Save } from "lucide-react";

const KINDS: { key: TemplateKind; label: string; desc: string }[] = [
  { key: "confirm", label: "Confirmation", desc: "Sent when you confirm a new request." },
  { key: "reschedule", label: "Reschedule", desc: "Sent when you change the scheduled time." },
  { key: "cancel", label: "Cancellation", desc: "Sent when a request is cancelled." },
  { key: "report", label: "Report ready", desc: "Sent when the consultation/health-check report is uploaded." },
];

const PLACEHOLDERS = ["{client_name}", "{provider_name}", "{service_name}", "{scheduled_at}", "{report_url}"];

interface Row { kind: TemplateKind; channel: TemplateChannel; subject: string; body: string }

export default function WellnessTemplatesPage() {
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("wellness_message_templates" as never).select("kind,channel,subject,body");
    const map: Record<string, Row> = {};
    for (const k of KINDS) for (const c of ["email", "whatsapp"] as TemplateChannel[]) {
      const existing = (data as any[] | null)?.find((r) => r.kind === k.key && r.channel === c);
      map[`${k.key}:${c}`] = {
        kind: k.key, channel: c,
        subject: existing?.subject ?? DEFAULTS[k.key][c].subject,
        body: existing?.body ?? DEFAULTS[k.key][c].body,
      };
    }
    setRows(map); setLoading(false);
  };
  useEffect(() => { load(); }, []);

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
          <Tabs defaultValue="confirm" className="w-full">
            <TabsList>
              {KINDS.map((k) => <TabsTrigger key={k.key} value={k.key}>{k.label}</TabsTrigger>)}
            </TabsList>
            {KINDS.map((k) => (
              <TabsContent key={k.key} value={k.key} className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">{k.desc}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(["email", "whatsapp"] as TemplateChannel[]).map((channel) => {
                    const key = `${k.key}:${channel}`;
                    const r = rows[key];
                    if (!r) return null;
                    return (
                      <Card key={key}>
                        <CardHeader className="flex flex-row items-center justify-between">
                          <CardTitle className="text-sm capitalize">{channel}</CardTitle>
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
              </TabsContent>
            ))}
          </Tabs>
        }
      </div>
    </AppLayout>
  );
}
