// Settings → WhatsApp Templates
// Full editor for whatsapp_templates including system seed templates.
// Supports create / edit / delete / activate.

import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { MessageCircle, Pencil, Trash2, Plus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { useWhatsAppApiSettings } from "@/hooks/useWhatsAppApiSettings";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { WhatsAppTemplate } from "@/hooks/useWhatsAppTemplates";

const CATEGORIES = ["tpa", "patient", "insurer", "internal"] as const;
const AUDIENCES = ["any", "cfo", "billing", "ops"] as const;

type Draft = Partial<WhatsAppTemplate> & { name: string; body: string };

const blankDraft: Draft = {
  name: "",
  category: "tpa",
  audience_role: "any",
  body: "",
  subject_hint: "",
  sort_order: 100,
  is_active: true,
};

export default function WhatsAppTemplatesPage() {
  const [items, setItems] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("whatsapp_templates" as never)
      .select("*")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    setItems((data as unknown as WhatsAppTemplate[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { void reload(); }, []);

  const openNew = () => {
    setEditId(null); setDraft(blankDraft); setEditOpen(true);
  };
  const openEdit = (t: WhatsAppTemplate) => {
    setEditId(t.id);
    setDraft({
      name: t.name, category: t.category, audience_role: t.audience_role,
      body: t.body, subject_hint: t.subject_hint ?? "",
      sort_order: t.sort_order, is_active: t.is_active,
    });
    setEditOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim() || !draft.body.trim()) {
      toast.error("Name and body are required");
      return;
    }
    setSaving(true);
    const payload = {
      org_id: getCurrentOrgId(),
      name: draft.name.trim(),
      category: draft.category ?? "tpa",
      audience_role: draft.audience_role ?? "any",
      body: draft.body,
      subject_hint: draft.subject_hint || null,
      sort_order: draft.sort_order ?? 100,
      is_active: draft.is_active ?? true,
    };
    const op = editId
      ? supabase.from("whatsapp_templates" as never).update(payload as never).eq("id", editId)
      : supabase.from("whatsapp_templates" as never).insert(payload as never);
    const { error } = await op;
    setSaving(false);
    if (error) return toast.error("Save failed", { description: error.message });
    toast.success(editId ? "Template updated" : "Template added");
    setEditOpen(false);
    await reload();
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("whatsapp_templates" as never).delete().eq("id", id);
    if (error) return toast.error("Delete failed", { description: error.message });
    toast.success("Template deleted");
    await reload();
  };

  const toggleActive = async (id: string, val: boolean) => {
    await supabase.from("whatsapp_templates" as never).update({ is_active: val } as never).eq("id", id);
    await reload();
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-whatsapp/10 text-whatsapp">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-display">WhatsApp Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Edit, create, and remove WhatsApp message templates — including system-seeded ones.
              Use tokens like <code className="text-[10px]">{"{patient_name}"}</code>,{" "}
              <code className="text-[10px]">{"{claim_number}"}</code>,{" "}
              <code className="text-[10px]">{"{outstanding_amount}"}</code>.
            </p>
          </div>
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> New template
          </Button>
        </div>

        <WhatsAppApiSettingsCard />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">All templates</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-6 flex items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No templates yet.</p>
            ) : (
              <div className="space-y-2">
                {items.map((t) => (
                  <div key={t.id} className="rounded-md border p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm">{t.name}</span>
                        <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                        <Badge variant="outline" className="text-[10px]">{t.audience_role}</Badge>
                        {t.is_system && <Badge variant="secondary" className="text-[10px]">System</Badge>}
                        {!t.is_active && <Badge variant="outline" className="text-[10px] bg-muted">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3 font-mono">
                        {t.body}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch checked={t.is_active}
                        onCheckedChange={(v) => toggleActive(t.id, v)} />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        onClick={() => remove(t.id, t.name)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input type="number" value={draft.sort_order ?? 100}
                  onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 100 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={draft.category ?? "tpa"}
                  onValueChange={(v) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Audience role</Label>
                <Select value={draft.audience_role ?? "any"}
                  onValueChange={(v) => setDraft({ ...draft, audience_role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Subject hint (optional)</Label>
              <Input value={draft.subject_hint ?? ""}
                onChange={(e) => setDraft({ ...draft, subject_hint: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Body</Label>
              <Textarea rows={10} value={draft.body} className="font-mono text-xs"
                onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={draft.is_active ?? true}
                onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editId ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function WhatsAppApiSettingsCard() {
  const { settings, loading, saving, save } = useWhatsAppApiSettings();
  const { role } = useAuth();
  const canManage = role === "owner" || role === "admin";
  const toggle = async (enabled: boolean) => {
    if (!canManage) return;
    const err = await save({ ...settings, enabled });
    if (err) toast.error(err.message);
    else toast.success(enabled ? "Business API enabled for this hospital" : "Reverted to wa.me deep links");
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-whatsapp" />
          WhatsApp Business API
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label className="text-sm">Send via Meta Cloud API</Label>
            <p className="text-xs text-muted-foreground max-w-xl">
              When on, this hospital sends messages through the WhatsApp Business
              API and delivery status updates from Meta callbacks. When off, the
              composer falls back to wa.me deep-links — users can also pick
              "Send from device" any time as a backup.
            </p>
            {!canManage && (
              <p className="text-[11px] text-warning">
                Only hospital admins or managers can change this setting.
              </p>
            )}
          </div>
          {canManage ? (
            <Switch
              checked={settings.enabled}
              disabled={loading || saving}
              onCheckedChange={(v) => void toggle(!!v)}
            />
          ) : (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} className="inline-flex">
                    <Switch checked={settings.enabled} disabled aria-disabled />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  You don't have permission to do this
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {settings.enabled && (
          <p className="text-[11px] text-muted-foreground border-t pt-2">
            Make sure project secrets <code>WHATSAPP_TOKEN</code>,{" "}
            <code>WHATSAPP_PHONE_ID</code>, <code>WHATSAPP_VERIFY_TOKEN</code>,{" "}
            and <code>WHATSAPP_APP_SECRET</code> are configured, and that the
            Meta webhook points to <code>/api/public/hooks/whatsapp-delivery</code>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
