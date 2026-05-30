import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Mail, Loader2 } from "lucide-react";
import { useAppUsers, type AppUser } from "@/hooks/useAppUsers";
import { useActingUserId } from "@/hooks/useActingUser";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const PRESETS = [
  { label: "Gmail (TLS)", host: "smtp.gmail.com", port: 587, tls: true },
  { label: "Outlook 365 (TLS)", host: "smtp.office365.com", port: 587, tls: true },
  { label: "Zoho (SSL)", host: "smtp.zoho.in", port: 465, tls: true },
  { label: "Custom", host: "", port: 587, tls: true },
];

export default function MyEmailPage() {
  const { users, updateUser, loading } = useAppUsers();
  const [actingUserId, setActingUserId] = useActingUserId();
  const [testing, setTesting] = useState(false);
  const [draft, setDraft] = useState<Partial<AppUser>>({});

  const me: AppUser | undefined = users.find((u) => u.id === actingUserId);

  // Hydrate draft when selected user changes
  useEffect(() => {
    if (!me) { setDraft({}); return; }
    setDraft({
      id: me.id,
      smtp_host: me.smtp_host ?? "",
      smtp_port: me.smtp_port ?? 587,
      smtp_username: me.smtp_username ?? me.email,
      smtp_password: me.smtp_password ?? "",
      smtp_use_tls: me.smtp_use_tls ?? true,
      smtp_from_name: me.smtp_from_name ?? me.name,
      smtp_from_email: me.smtp_from_email ?? me.email,
      smtp_reply_to: me.smtp_reply_to ?? "",
    });
  }, [me?.id]);

  const handleSave = async () => {
    if (!me) return;
    const ok = await updateUser(me.id, {
      smtp_host: (draft.smtp_host as string) || null,
      smtp_port: draft.smtp_port ? Number(draft.smtp_port) : null,
      smtp_username: (draft.smtp_username as string) || null,
      smtp_password: (draft.smtp_password as string) || null,
      smtp_use_tls: draft.smtp_use_tls ?? true,
      smtp_from_name: (draft.smtp_from_name as string) || null,
      smtp_from_email: (draft.smtp_from_email as string) || null,
      smtp_reply_to: (draft.smtp_reply_to as string) || null,
      // Reset verification when creds change
      smtp_verified_at: null,
    });
    if (ok) {
      toast({ title: "SMTP saved", description: "Run 'Test connection' to verify before sending." });
    }
  };

  const handleTest = async () => {
    if (!me) return;
    // First save current draft so the function reads the latest values
    await handleSave();
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("smtp-test", {
        body: { userId: me.id },
      });
      if (error) throw error;
      if (data?.ok) {
        toast({ title: "✅ SMTP works", description: `Test email sent to ${data.sentTo}` });
      } else {
        toast({ title: "SMTP test failed", description: data?.error ?? "Unknown error", variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: "SMTP test failed",
        description: e instanceof Error ? e.message : "Could not reach test function",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const applyPreset = (label: string) => {
    const p = PRESETS.find((x) => x.label === label);
    if (!p) return;
    setDraft((d) => ({ ...d, smtp_host: p.host, smtp_port: p.port, smtp_use_tls: p.tls }));
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" /> My Email Setup
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect your own mailbox so insurer/TPA emails go out from your address — replies come back to you.
          </p>
        </div>

        {/* Acting user picker */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">You are</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Pick which user this SMTP belongs to. Once auth is added, this will auto-detect.
              </p>
            </div>
            <Select value={actingUserId ?? ""} onValueChange={(v) => setActingUserId(v || null)} disabled={loading}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select your user…" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} <span className="text-muted-foreground">· {u.email}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {!me ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            Select your user above to configure SMTP.
          </Card>
        ) : (
          <Card className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">SMTP credentials for {me.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  These are stored on your account and used only when you send emails from RCM Buddy.
                </p>
              </div>
              {me.smtp_verified_at ? (
                <Badge variant="secondary" className="gap-1 bg-success/10 text-success">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <AlertCircle className="h-3 w-3" /> Not verified
                </Badge>
              )}
            </div>

            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label>Quick preset</Label>
                <Select onValueChange={applyPreset}>
                  <SelectTrigger><SelectValue placeholder="Pick a provider preset (optional)…" /></SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>SMTP host</Label>
                  <Input
                    placeholder="smtp.gmail.com"
                    value={draft.smtp_host ?? ""}
                    onChange={(e) => setDraft({ ...draft, smtp_host: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    placeholder="587"
                    value={draft.smtp_port ?? ""}
                    onChange={(e) => setDraft({ ...draft, smtp_port: Number(e.target.value) || null })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input
                    placeholder="you@hospital.com"
                    value={draft.smtp_username ?? ""}
                    onChange={(e) => setDraft({ ...draft, smtp_username: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Password / App password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={draft.smtp_password ?? ""}
                    onChange={(e) => setDraft({ ...draft, smtp_password: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                <Switch
                  checked={draft.smtp_use_tls ?? true}
                  onCheckedChange={(v) => setDraft({ ...draft, smtp_use_tls: v })}
                />
                <div>
                  <div className="text-sm font-medium">Use SSL/TLS</div>
                  <div className="text-xs text-muted-foreground">Recommended on. Disable only for legacy STARTTLS-only servers.</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>"From" name shown to recipients</Label>
                  <Input
                    placeholder="Priya · Apollo Billing"
                    value={draft.smtp_from_name ?? ""}
                    onChange={(e) => setDraft({ ...draft, smtp_from_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>"From" email</Label>
                  <Input
                    type="email"
                    placeholder="priya@apollo.com"
                    value={draft.smtp_from_email ?? ""}
                    onChange={(e) => setDraft({ ...draft, smtp_from_email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Reply-To (optional)</Label>
                <Input
                  type="email"
                  placeholder="billing-team@apollo.com"
                  value={draft.smtp_reply_to ?? ""}
                  onChange={(e) => setDraft({ ...draft, smtp_reply_to: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Where replies should land. Leave empty to use your "From" email.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" onClick={handleSave}>Save</Button>
              <Button onClick={handleTest} disabled={testing} className="gap-1.5">
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                {testing ? "Testing…" : "Save & test connection"}
              </Button>
            </div>

            {!me.smtp_verified_at && (
              <p className="text-xs text-muted-foreground bg-warning/10 border border-warning/30 rounded-md p-3">
                ⓘ Until you successfully test your connection, all your sends will use the platform's default sender.
              </p>
            )}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
