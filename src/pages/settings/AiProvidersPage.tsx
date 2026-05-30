import { useState } from "react";
import { Bot, Plus, Trash2, Check, KeyRound, ExternalLink, Sparkles } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAiProviders, PROVIDER_META, maskKey, type ProviderKind } from "@/hooks/useAiProviders";

export default function AiProvidersPage() {
  const { providers, loading, reload } = useAiProviders();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const setDefault = async (id: string) => {
    await supabase.from("ai_providers").update({ is_default: false }).neq("id", id);
    await supabase.from("ai_providers").update({ is_default: true }).eq("id", id);
    await reload();
    toast({ title: "Default provider updated" });
  };

  const toggleActive = async (id: string, next: boolean) => {
    await supabase.from("ai_providers").update({ is_active: next }).eq("id", id);
    await reload();
  };

  const remove = async (id: string) => {
    await supabase.from("ai_providers").delete().eq("id", id);
    await reload();
    toast({ title: "Provider removed" });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> AI Providers
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Bring your own LLM API keys. Used by the AI Center to draft appeals, query replies, discharge summaries and insurer emails.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add provider</Button>
            </DialogTrigger>
            <AddProviderDialog onSaved={() => { setOpen(false); void reload(); }} />
          </Dialog>
        </div>

        {loading ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
        ) : providers.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <Bot className="h-10 w-10 text-muted-foreground mx-auto" />
              <div>
                <h3 className="text-base font-semibold">No AI providers configured</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Add an API key from Anthropic, OpenAI, OpenRouter or Google to power the AI Center.
                </p>
              </div>
              <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Add your first provider
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {providers.map((p) => {
              const meta = PROVIDER_META[p.provider as ProviderKind];
              return (
                <Card key={p.id} className="shadow-sm">
                  <CardContent className="py-4 px-5 flex items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-primary/10">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold">{p.display_name}</h3>
                        <Badge variant="outline" className="text-[10px]">{meta?.label ?? p.provider}</Badge>
                        {p.is_default && <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">Default</Badge>}
                        {!p.is_active && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono">{maskKey(p.api_key)}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Model: <span className="font-medium">{p.default_model ?? "auto"}</span> · {p.total_calls} calls · {p.total_tokens.toLocaleString()} tokens
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={p.is_active} onCheckedChange={(v) => toggleActive(p.id, v)} />
                      {!p.is_default && p.is_active && (
                        <Button variant="outline" size="sm" className="text-xs h-8 gap-1" onClick={() => setDefault(p.id)}>
                          <Check className="h-3.5 w-3.5" /> Make default
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => remove(p.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="bg-muted/30 border-dashed">
          <CardContent className="py-4 px-5 flex items-start gap-3">
            <KeyRound className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">How it works</p>
              <p>API keys are stored encrypted in your backend and only used by the secure <code className="text-[11px] bg-background px-1 rounded">ai-generate</code> edge function — never exposed to the browser. The default provider is used when no specific model is selected in a tool.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

// ---------------- Add Provider Dialog ----------------

function AddProviderDialog({ onSaved }: { onSaved: () => void }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<ProviderKind>("anthropic");
  const [displayName, setDisplayName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDER_META.anthropic.models[0].id);
  const [notes, setNotes] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [saving, setSaving] = useState(false);

  const meta = PROVIDER_META[provider];

  const onProviderChange = (p: ProviderKind) => {
    setProvider(p);
    setModel(PROVIDER_META[p].models[0].id);
    if (!displayName) setDisplayName(PROVIDER_META[p].label);
  };

  const save = async () => {
    if (!apiKey.trim()) {
      toast({ title: "API key required", variant: "destructive" });
      return;
    }
    setSaving(true);
    if (makeDefault) {
      await supabase.from("ai_providers").update({ is_default: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    }
    const { getCurrentOrgId } = await import("@/lib/currentOrg");
    const { error } = await supabase.from("ai_providers").insert({
      org_id: getCurrentOrgId(),
      provider,
      display_name: displayName.trim() || meta.label,
      api_key: apiKey.trim(),
      default_model: model,
      is_default: makeDefault,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Provider added", description: `${meta.label} is ready to use.` });
    setProvider("anthropic");
    setDisplayName(""); setApiKey(""); setNotes("");
    onSaved();
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Add AI Provider
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Provider</Label>
            <Select value={provider} onValueChange={(v) => onProviderChange(v as ProviderKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDER_META) as ProviderKind[]).map((k) => (
                  <SelectItem key={k} value={k}>{PROVIDER_META[k].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Default model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {meta.models.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={meta.label} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center justify-between">
            <span>API Key</span>
            <span className="text-[10px] font-normal text-muted-foreground inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> {meta.keyHelp}
            </span>
          </Label>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" className="font-mono" />
          <p className="text-[10px] text-muted-foreground">{meta.hint}</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Hospital corporate account" rows={2} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Switch checked={makeDefault} onCheckedChange={setMakeDefault} />
          Set as default provider
        </label>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? "Saving…" : "Save provider"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
