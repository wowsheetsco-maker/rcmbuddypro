// Settings → Followup Automation
// Configure scheduling rules per claim pendency bucket × SLA breach status,
// and edit the four tone templates (Formal / Urgent / Friendly / SLA) used
// when "Automatic Followup Mail" is launched from a claim drawer.

import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Save, Mail, MessageCircle, AlertTriangle, Clock, Sparkles, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  useFollowupAutomation,
  DEFAULT_FOLLOWUP_AUTOMATION,
  FOLLOWUP_TOKENS,
  type FollowupAutomationConfig,
  type BucketRule,
  type PendencyBucket,
} from "@/hooks/useFollowupAutomation";
import type { FollowUpTone } from "@/components/BulkFollowUpComposer";

const TONE_OPTIONS: { value: FollowUpTone; label: string }[] = [
  { value: "friendly", label: "Friendly Follow-up" },
  { value: "formal",   label: "Formal Reminder" },
  { value: "urgent",   label: "Urgent Escalation" },
  { value: "irdai",    label: "SLA Breach Notice" },
];

const BUCKET_LABEL: Record<PendencyBucket, string> = {
  "0-15": "0 – 15 days",
  "16-30": "16 – 30 days",
  "31-60": "31 – 60 days",
  "60+": "60+ days",
};

export default function FollowupAutomationPage() {
  const { config, loading, saving, save } = useFollowupAutomation();
  const [draft, setDraft] = useState<FollowupAutomationConfig>(config);

  useEffect(() => { setDraft(config); }, [config]);

  const updateBucket = (idx: number, patch: Partial<BucketRule>) => {
    setDraft((d) => ({
      ...d,
      buckets: d.buckets.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    }));
  };

  const updateTemplate = (tone: FollowUpTone, field: "subject" | "body", v: string) => {
    setDraft((d) => ({
      ...d,
      templates: { ...d.templates, [tone]: { ...d.templates[tone], [field]: v } },
    }));
  };

  const handleSave = async () => {
    const err = await save(draft);
    if (err) toast.error("Failed to save", { description: err.message });
    else toast.success("Followup automation saved");
  };

  const handleReset = () => {
    setDraft(DEFAULT_FOLLOWUP_AUTOMATION);
    toast.info("Reverted to defaults — click Save to apply");
  };

  return (
    <AppLayout>
      <div className="px-4 md:px-6 py-6 space-y-5 max-w-[1200px] mx-auto">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Followup Automation</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Set how aggressively we chase outstanding claims by pendency bucket and
              SLA breach status — and customise the tone templates used when generating
              an Automatic Followup Mail from any claim.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={loading || saving}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset defaults
            </Button>
            <Button size="sm" onClick={handleSave} disabled={loading || saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="rules">
          <TabsList>
            <TabsTrigger value="rules">
              <Clock className="h-3.5 w-3.5 mr-1.5" /> Scheduling Rules
            </TabsTrigger>
            <TabsTrigger value="templates">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Mail Templates
            </TabsTrigger>
          </TabsList>

          {/* RULES TAB */}
          <TabsContent value="rules" className="space-y-4 pt-3">
            <Card className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Per-pendency rules</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Each rule applies when a claim falls into the matching aging bucket.
                The selected channels fire on the cadence below; tone determines which
                template is used in the Automatic Followup Mail.
              </p>

              <div className="space-y-3">
                {draft.buckets.map((b, idx) => (
                  <div key={b.bucket} className="rounded-md border p-3 space-y-3 bg-card">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                          {BUCKET_LABEL[b.bucket]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">pendency bucket</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Active</Label>
                        <Switch checked={b.enabled} onCheckedChange={(v) => updateBucket(idx, { enabled: v })} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="flex items-center justify-between rounded border px-3 py-2">
                        <Label className="text-xs flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-blue-600" /> Email
                        </Label>
                        <Switch
                          checked={b.email}
                          disabled={!b.enabled}
                          onCheckedChange={(v) => updateBucket(idx, { email: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded border px-3 py-2">
                        <Label className="text-xs flex items-center gap-1.5">
                          <MessageCircle className="h-3.5 w-3.5 text-whatsapp" /> WhatsApp
                        </Label>
                        <Switch
                          checked={b.whatsapp}
                          disabled={!b.enabled}
                          onCheckedChange={(v) => updateBucket(idx, { whatsapp: v })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Tone</Label>
                        <Select
                          value={b.tone}
                          disabled={!b.enabled}
                          onValueChange={(v) => updateBucket(idx, { tone: v as FollowUpTone })}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TONE_OPTIONS.map((t) => (
                              <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Cadence (days)</Label>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 text-xs"
                          value={b.cadenceDays}
                          disabled={!b.enabled}
                          onChange={(e) => updateBucket(idx, { cadenceDays: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4 space-y-3 border-l-4 border-l-destructive">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h2 className="text-sm font-semibold">SLA breach override</h2>
                <div className="ml-auto flex items-center gap-2">
                  <Label className="text-xs">Active</Label>
                  <Switch
                    checked={draft.irdai.enabled}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, irdai: { ...d.irdai, enabled: v } }))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Applied to any claim that has crossed the 30-day SLA settlement window,
                regardless of which pendency bucket it falls into.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="flex items-center justify-between rounded border px-3 py-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-blue-600" /> Email
                  </Label>
                  <Switch
                    checked={draft.irdai.email}
                    disabled={!draft.irdai.enabled}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, irdai: { ...d.irdai, email: v } }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded border px-3 py-2">
                  <Label className="text-xs flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 text-whatsapp" /> WhatsApp
                  </Label>
                  <Switch
                    checked={draft.irdai.whatsapp}
                    disabled={!draft.irdai.enabled}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, irdai: { ...d.irdai, whatsapp: v } }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Tone</Label>
                  <Select
                    value={draft.irdai.tone}
                    disabled={!draft.irdai.enabled}
                    onValueChange={(v) => setDraft((d) => ({ ...d, irdai: { ...d.irdai, tone: v as FollowUpTone } }))}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Cadence (days)</Label>
                  <Input
                    type="number" min={0} className="h-8 text-xs"
                    value={draft.irdai.cadenceDays}
                    disabled={!draft.irdai.enabled}
                    onChange={(e) => setDraft((d) => ({ ...d, irdai: { ...d.irdai, cadenceDays: Number(e.target.value) || 0 } }))}
                  />
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* TEMPLATES TAB */}
          <TabsContent value="templates" className="space-y-4 pt-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Tokens you can use</h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FOLLOWUP_TOKENS.map((t) => (
                  <Badge key={t.token} variant="outline" className="text-[10px] font-mono" title={t.description}>
                    {t.token}
                  </Badge>
                ))}
              </div>
            </Card>

            {TONE_OPTIONS.map((tone) => (
              <Card key={tone.value} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">{tone.label}</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Used when Automatic Followup picks tone <span className="font-mono">{tone.value}</span>.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{tone.value}</Badge>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <Input
                    value={draft.templates[tone.value].subject}
                    onChange={(e) => updateTemplate(tone.value, "subject", e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Body</Label>
                  <Textarea
                    rows={9}
                    value={draft.templates[tone.value].body}
                    onChange={(e) => updateTemplate(tone.value, "body", e.target.value)}
                    className="text-xs font-mono leading-relaxed"
                  />
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
