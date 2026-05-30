// Settings → Contacts: full CRUD over the insurer_contacts table.
// Used by the Follow-up Engine to look up TPA / Insurer email IDs when
// composing bulk reminder emails.

import { useMemo, useState } from "react";
import {
  Users, Plus, Phone, Mail, Search, Star, StarOff,
  MessageCircle, Pencil, Trash2, Loader2, Upload,
} from "lucide-react";
import ContactsCsvImportDialog from "@/components/ContactsCsvImportDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useInsurerContacts, type InsurerContactRow } from "@/hooks/useInsurerContacts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ContactDraft = Omit<InsurerContactRow, "id"> & { id?: string };

const EMPTY: ContactDraft = {
  provider: "",
  contact_name: "",
  designation: "",
  email: "",
  cc_emails: "",
  phone: "",
  whatsapp: "",
  is_primary: true,
  notes: "",
  contract_expiry_date: null,
};

export default function ContactsPage() {
  const { contacts, loading, reload } = useInsurerContacts();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ContactDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<InsurerContactRow | null>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.contact_name.toLowerCase().includes(q) ||
        c.provider.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  const openCreate = () => setEditing({ ...EMPTY });
  const openEdit = (c: InsurerContactRow) => setEditing({ ...c });

  const save = async () => {
    if (!editing) return;
    if (!editing.provider.trim() || !editing.contact_name.trim() || !editing.email.trim()) {
      toast.error("Provider, contact name and email are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        provider: editing.provider.trim(),
        contact_name: editing.contact_name.trim(),
        designation: editing.designation || null,
        email: editing.email.trim(),
        cc_emails: editing.cc_emails || null,
        phone: editing.phone || null,
        whatsapp: editing.whatsapp || null,
        is_primary: editing.is_primary,
        notes: editing.notes || null,
      };

      // If marking as primary, demote existing primaries for the same provider
      if (editing.is_primary) {
        const targetId = editing.id ?? "00000000-0000-0000-0000-000000000000";
        await supabase
          .from("insurer_contacts")
          .update({ is_primary: false })
          .eq("provider", payload.provider)
          .neq("id", targetId);
      }

      if (editing.id) {
        const { error } = await supabase
          .from("insurer_contacts")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Contact updated");
      } else {
        const { getCurrentOrgId } = await import("@/lib/currentOrg");
        const { error } = await supabase.from("insurer_contacts").insert({ ...payload, org_id: getCurrentOrgId() });
        if (error) throw error;
        toast.success("Contact added");
      }
      setEditing(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const togglePrimary = async (c: InsurerContactRow) => {
    try {
      if (!c.is_primary) {
        // Demote all others for this provider, promote this one
        await supabase
          .from("insurer_contacts")
          .update({ is_primary: false })
          .eq("provider", c.provider)
          .neq("id", c.id);
      }
      const { error } = await supabase
        .from("insurer_contacts")
        .update({ is_primary: !c.is_primary })
        .eq("id", c.id);
      if (error) throw error;
      toast.success(c.is_primary ? "Removed primary flag" : "Set as primary");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      const { error } = await supabase
        .from("insurer_contacts")
        .delete()
        .eq("id", confirmDelete.id);
      if (error) throw error;
      toast.success("Contact deleted");
      setConfirmDelete(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <AppLayout>
      <div className="px-4 md:px-6 py-6 space-y-5 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Contacts Directory
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage TPA / Insurer SPOC contacts. Used by the Follow-up Engine to send pendency emails.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setCsvImportOpen(true)}
              className="gap-1.5"
            >
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Contact
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <Card>
          <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, provider, or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {filtered.length} of {contacts.length} contact{contacts.length === 1 ? "" : "s"}
            </span>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  {["Primary", "Provider", "Contact", "Email", "Phone", "WhatsApp", "Actions"].map((h) => (
                    <th
                      key={h}
                      className="text-left py-2.5 px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin inline-block mr-2" />
                      Loading contacts…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground text-sm">
                      No contacts yet. Click <strong>Add Contact</strong> to create one.
                    </td>
                  </tr>
                )}
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => togglePrimary(c)}
                        title={c.is_primary ? "Primary contact" : "Set as primary"}
                        aria-label={c.is_primary ? "Primary contact" : "Set as primary"}
                        className={cn(
                          "transition-colors",
                          c.is_primary
                            ? "text-warning hover:text-warning/80"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {c.is_primary ? (
                          <Star className="h-4 w-4 fill-current" />
                        ) : (
                          <StarOff className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-sm">{c.provider}</div>
                      {c.is_primary && (
                        <Badge className="text-[9px] mt-0.5 bg-accent text-accent-foreground">
                          Primary
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-sm">{c.contact_name}</div>
                      {c.designation && (
                        <div className="text-[11px] text-muted-foreground">{c.designation}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      <a
                        href={`mailto:${c.email}`}
                        className="text-secondary hover:underline inline-flex items-center gap-1"
                      >
                        <Mail className="h-3 w-3" />
                        {c.email}
                      </a>
                      {c.cc_emails && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[220px]">
                          cc: {c.cc_emails}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      {c.phone ? (
                        <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {c.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      {c.whatsapp ? (
                        <span className="inline-flex items-center gap-1 text-accent-foreground">
                          <MessageCircle className="h-3 w-3" />
                          {c.whatsapp}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => openEdit(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => setConfirmDelete(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Edit / create dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Contact" : "Add Contact"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Provider / TPA *</Label>
                  <Input
                    value={editing.provider}
                    onChange={(e) => setEditing({ ...editing, provider: e.target.value })}
                    placeholder="e.g. Star Health"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Contact Name *</Label>
                  <Input
                    value={editing.contact_name}
                    onChange={(e) => setEditing({ ...editing, contact_name: e.target.value })}
                    placeholder="Full name"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Designation</Label>
                <Input
                  value={editing.designation ?? ""}
                  onChange={(e) => setEditing({ ...editing, designation: e.target.value })}
                  placeholder="Claims Manager"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Email *</Label>
                <Input
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  type="email"
                  placeholder="claims@tpa.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">CC Emails (comma-separated)</Label>
                <Input
                  value={editing.cc_emails ?? ""}
                  onChange={(e) => setEditing({ ...editing, cc_emails: e.target.value })}
                  placeholder="manager@hospital.com, finance@hospital.com"
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={editing.phone ?? ""}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    placeholder="+91 …"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">WhatsApp</Label>
                  <Input
                    value={editing.whatsapp ?? ""}
                    onChange={(e) => setEditing({ ...editing, whatsapp: e.target.value })}
                    placeholder="+91 …"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  rows={2}
                  className="mt-1 text-sm"
                  placeholder="Internal notes (escalation paths, working hours…)"
                />
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.is_primary}
                  onChange={(e) => setEditing({ ...editing, is_primary: e.target.checked })}
                  className="h-4 w-4"
                />
                <Star className="h-4 w-4 text-warning" />
                Set as primary contact for {editing.provider || "this provider"}
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{confirmDelete?.contact_name}</strong> (
              {confirmDelete?.provider}) from the directory. The Follow-up Engine will no longer be
              able to auto-fill emails for this provider.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV / Excel bulk-import */}
      <ContactsCsvImportDialog
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        existing={contacts}
        onImported={reload}
      />
    </AppLayout>
  );
}
