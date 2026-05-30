import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, AlertCircle, Loader2, Mail } from "lucide-react";
import { ROLES, STATUSES, type AppUser, type UserRole, type UserStatus } from "@/hooks/useAppUsers";
import { useOrgDesignations } from "@/hooks/useOrgDesignations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X } from "lucide-react";

interface SmtpFields {
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_use_tls: boolean;
  smtp_from_name: string;
  smtp_from_email: string;
  smtp_reply_to: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: AppUser | null;
  onSubmit: (data: {
    name: string;
    email: string;
    phone: string | null;
    role: UserRole;
    status: UserStatus;
    department: string | null;
    designation: string | null;
    notes: string | null;
    smtp?: Partial<SmtpFields> & { smtp_verified_at?: string | null };
  }) => Promise<boolean>;
}

const PRESETS = [
  { label: "Gmail (TLS)", host: "smtp.gmail.com", port: 587, tls: true },
  { label: "Outlook 365 (TLS)", host: "smtp.office365.com", port: 587, tls: true },
  { label: "Zoho (SSL)", host: "smtp.zoho.in", port: 465, tls: true },
  { label: "Custom", host: "", port: 587, tls: true },
];

const empty = {
  name: "",
  email: "",
  phone: "",
  role: "Billing Executive" as UserRole,
  status: "invited" as UserStatus,
  department: "",
  designation: "",
  notes: "",
};

const emptySmtp: SmtpFields = {
  smtp_host: "",
  smtp_port: 587,
  smtp_username: "",
  smtp_password: "",
  smtp_use_tls: true,
  smtp_from_name: "",
  smtp_from_email: "",
  smtp_reply_to: "",
};

export default function UserFormDialog({ open, onOpenChange, initial, onSubmit }: Props) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [showSmtp, setShowSmtp] = useState(false);
  const [smtp, setSmtp] = useState<SmtpFields>(emptySmtp);
  const [smtpDirty, setSmtpDirty] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [newDesignation, setNewDesignation] = useState("");
  const [addingDesignation, setAddingDesignation] = useState(false);
  const { items: designations, addDesignation } = useOrgDesignations();
  const isEdit = Boolean(initial);

  const handleAddDesignation = async () => {
    const label = newDesignation.trim();
    if (!label) return;
    const created = await addDesignation(label);
    if (created) {
      setForm((f) => ({ ...f, designation: created.label }));
      setNewDesignation("");
      setAddingDesignation(false);
    }
  };


  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        email: initial.email,
        phone: initial.phone ?? "",
        role: initial.role,
        status: initial.status,
        department: initial.department ?? "",
        designation: initial.designation ?? "",
        notes: initial.notes ?? "",
      });
      const hasSmtp = Boolean(initial.smtp_host || initial.smtp_username);
      setShowSmtp(hasSmtp);
      setSmtp({
        smtp_host: initial.smtp_host ?? "",
        smtp_port: initial.smtp_port ?? 587,
        smtp_username: initial.smtp_username ?? initial.email,
        smtp_password: initial.smtp_password ?? "",
        smtp_use_tls: initial.smtp_use_tls ?? true,
        smtp_from_name: initial.smtp_from_name ?? initial.name,
        smtp_from_email: initial.smtp_from_email ?? initial.email,
        smtp_reply_to: initial.smtp_reply_to ?? "",
      });
      setVerifiedAt(initial.smtp_verified_at ?? null);
    } else {
      setForm(empty);
      setSmtp(emptySmtp);
      setShowSmtp(false);
      setVerifiedAt(null);
    }
    setSmtpDirty(false);
  }, [open, initial]);

  const updateSmtp = (patch: Partial<SmtpFields>) => {
    setSmtp((prev) => ({ ...prev, ...patch }));
    setSmtpDirty(true);
    setVerifiedAt(null);
  };

  const applyPreset = (label: string) => {
    const p = PRESETS.find((x) => x.label === label);
    if (!p) return;
    updateSmtp({ smtp_host: p.host, smtp_port: p.port, smtp_use_tls: p.tls });
  };

  const handleTest = async () => {
    if (!smtp.smtp_host || !smtp.smtp_username || !smtp.smtp_password) {
      toast({ title: "Missing SMTP fields", description: "Host, username, and password are required.", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("smtp-test", {
        body: {
          userId: initial?.id ?? null,
          host: smtp.smtp_host,
          port: Number(smtp.smtp_port),
          username: smtp.smtp_username,
          password: smtp.smtp_password,
          useTls: smtp.smtp_use_tls,
          fromName: smtp.smtp_from_name || form.name,
          fromEmail: smtp.smtp_from_email || smtp.smtp_username,
          recipient: smtp.smtp_username,
        },
      });
      if (error) throw error;
      const ok = (data as { success?: boolean })?.success;
      const msg = (data as { error?: string })?.error;
      if (!ok) throw new Error(msg ?? "Test failed");
      const stamp = new Date().toISOString();
      setVerifiedAt(stamp);
      toast({ title: "SMTP verified", description: "Test message sent successfully." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Test failed";
      toast({ title: "SMTP test failed", description: msg, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    const smtpPayload = showSmtp
      ? {
          smtp_host: smtp.smtp_host || null,
          smtp_port: smtp.smtp_port ? Number(smtp.smtp_port) : null,
          smtp_username: smtp.smtp_username || null,
          smtp_password: smtp.smtp_password || null,
          smtp_use_tls: smtp.smtp_use_tls,
          smtp_from_name: smtp.smtp_from_name || null,
          smtp_from_email: smtp.smtp_from_email || null,
          smtp_reply_to: smtp.smtp_reply_to || null,
          smtp_verified_at: smtpDirty ? verifiedAt : (initial?.smtp_verified_at ?? verifiedAt),
        }
      : showSmtp === false && initial && (initial.smtp_host || initial.smtp_username)
        ? {
            // Section toggled off explicitly: clear SMTP
            smtp_host: null, smtp_port: null, smtp_username: null, smtp_password: null,
            smtp_from_name: null, smtp_from_email: null, smtp_reply_to: null, smtp_verified_at: null,
          }
        : undefined;

    const ok = await onSubmit({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      role: form.role,
      status: form.status,
      department: form.department.trim() || null,
      designation: form.designation.trim() || null,
      notes: form.notes.trim() || null,
      smtp: smtpPayload as any,
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "Invite user"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update profile, role, status, and email sending." : "Add a team member to the directory."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@hospital.com" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 …" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="department">Department</Label>
              <Input id="department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Billing" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as UserStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Designation (hospital-specific title)</Label>
              {!addingDesignation && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setAddingDesignation(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add new
                </Button>
              )}
            </div>
            {addingDesignation ? (
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newDesignation}
                  onChange={(e) => setNewDesignation(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDesignation(); } }}
                  placeholder="e.g. RCM Executive, Billing Submission"
                />
                <Button type="button" size="sm" onClick={handleAddDesignation}>Save</Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => { setAddingDesignation(false); setNewDesignation(""); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Select
                value={form.designation || "__none__"}
                onValueChange={(v) => setForm({ ...form, designation: v === "__none__" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select designation…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {designations.map((d) => (
                    <SelectItem key={d.id} value={d.label}>{d.label}</SelectItem>
                  ))}
                  {form.designation &&
                    !designations.some((d) => d.label === form.designation) && (
                      <SelectItem value={form.designation}>{form.designation}</SelectItem>
                    )}
                </SelectContent>
              </Select>
            )}
            <p className="text-[11px] text-muted-foreground">
              Designations are specific to this hospital. Permissions still come from the Role above.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
          </div>

          <Separator className="my-2" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Email sending (SMTP)</Label>
              {verifiedAt && showSmtp && (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </Badge>
              )}
              {!verifiedAt && showSmtp && (smtp.smtp_host || smtp.smtp_username) && (
                <Badge variant="outline" className="gap-1">
                  <AlertCircle className="h-3 w-3" /> Not tested
                </Badge>
              )}
            </div>
            <Switch checked={showSmtp} onCheckedChange={setShowSmtp} />
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            When configured & verified, this user's emails go from their own mailbox. Otherwise the platform default is used.
          </p>

          {showSmtp && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Provider preset</Label>
                <Select onValueChange={applyPreset}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Choose preset…" /></SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => <SelectItem key={p.label} value={p.label}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">SMTP host</Label>
                  <Input className="h-9" value={smtp.smtp_host} onChange={(e) => updateSmtp({ smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Port</Label>
                  <Input className="h-9" type="number" value={smtp.smtp_port} onChange={(e) => updateSmtp({ smtp_port: Number(e.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Username</Label>
                  <Input className="h-9" value={smtp.smtp_username} onChange={(e) => updateSmtp({ smtp_username: e.target.value })} placeholder="user@gmail.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Password / App password</Label>
                  <Input className="h-9" type="password" value={smtp.smtp_password} onChange={(e) => updateSmtp({ smtp_password: e.target.value })} placeholder="••••••••" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">From name</Label>
                  <Input className="h-9" value={smtp.smtp_from_name} onChange={(e) => updateSmtp({ smtp_from_name: e.target.value })} placeholder={form.name || "Display name"} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">From email</Label>
                  <Input className="h-9" type="email" value={smtp.smtp_from_email} onChange={(e) => updateSmtp({ smtp_from_email: e.target.value })} placeholder={form.email || "user@hospital.com"} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Reply-to (optional)</Label>
                  <Input className="h-9" type="email" value={smtp.smtp_reply_to} onChange={(e) => updateSmtp({ smtp_reply_to: e.target.value })} placeholder="claims@hospital.com" />
                </div>
                <div className="flex items-center justify-between gap-3 pb-1">
                  <div className="flex items-center gap-2">
                    <Switch checked={smtp.smtp_use_tls} onCheckedChange={(v) => updateSmtp({ smtp_use_tls: v })} />
                    <Label className="text-xs">Use TLS</Label>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleTest} disabled={testing}>
                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Test connection
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.email.trim()}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
