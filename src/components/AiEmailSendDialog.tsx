import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Mail, Send, Loader2, FileText, AlertCircle, Paperclip } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getActingUserId } from "@/hooks/useActingUser";
import {
  useInsurerContacts, findContactForProvider,
} from "@/hooks/useInsurerContacts";
import { useInsurerSpoc } from "@/hooks/useInsurerSpoc";

export interface AiAttachmentRef {
  name: string;
  path: string;
  size?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** AI draft body (plain text). */
  draftBody: string;
  /** Subject suggestion (we'll auto-generate one if empty). */
  defaultSubject?: string;
  /** Tool key (appeal_letter, query_reply, etc.) — used for tagging. */
  tool?: string;
  /** Claim context — drives contact lookup + timeline logging. */
  claimId?: string | null;
  claimNumber?: string | null;
  patientName?: string | null;
  insurerName?: string | null;
  hospitalName?: string | null;
  /** PDF/image storage paths uploaded in the AI dialog. */
  attachments?: AiAttachmentRef[];
  /** Pre-fill if AI tool already collected a "to" email. */
  initialTo?: string;
  /** Called after a successful send so the parent can refresh timeline. */
  onSent?: () => void;
}

export default function AiEmailSendDialog({
  open, onOpenChange,
  draftBody, defaultSubject, tool,
  claimId, claimNumber, patientName, insurerName, hospitalName,
  attachments = [],
  initialTo,
  onSent,
}: Props) {
  const { toast } = useToast();
  const { contacts } = useInsurerContacts();
  // Fallback SPOC resolution from the InsurerProfile escalation matrix
  const spoc = useInsurerSpoc(insurerName, insurerName);

  const [contactId, setContactId] = useState<string>("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // Auto-suggest subject if not provided
  const suggestedSubject = useMemo(() => {
    if (defaultSubject) return defaultSubject;
    const prefix = tool === "appeal_letter" ? "Appeal"
      : tool === "query_reply" ? "Query Reply"
      : tool === "discharge_summary" ? "Discharge Summary"
      : "Follow-up";
    const ref = claimNumber ? ` · ${claimNumber}` : "";
    const pat = patientName ? ` · ${patientName}` : "";
    return `${prefix}${ref}${pat}`.trim();
  }, [defaultSubject, tool, claimNumber, patientName]);

  // Best-guess primary contact for this insurer
  const matchedContact = useMemo(
    () => (insurerName ? findContactForProvider(contacts, insurerName) : undefined),
    [contacts, insurerName],
  );

  // Source label shown in the contact picker block
  const recipientSource: "saved" | "profile" | "manual" | null = matchedContact
    ? "saved"
    : spoc.tpaSpoc
      ? "profile"
      : null;

  useEffect(() => {
    if (!open) return;
    setBody(draftBody);
    setSubject(suggestedSubject);
    if (initialTo) {
      setTo(initialTo);
      setContactId("");
    } else if (matchedContact) {
      setContactId(matchedContact.id);
      setTo(matchedContact.email);
      setCc(matchedContact.cc_emails ?? "");
    } else if (spoc.tpaSpoc) {
      // No saved insurer_contacts row — fall back to the escalation matrix
      setContactId("");
      setTo(spoc.tpaSpoc.email);
      setCc(spoc.tpaSpocL2?.email ?? "");
    } else {
      setTo("");
      setCc("");
      setContactId("");
    }
  }, [open, draftBody, suggestedSubject, matchedContact, initialTo, spoc.tpaSpoc, spoc.tpaSpocL2]);

  const handleContactPick = (id: string) => {
    setContactId(id);
    const c = contacts.find((x) => x.id === id);
    if (c) {
      setTo(c.email);
      setCc(c.cc_emails ?? "");
    }
  };

  const handleSend = async () => {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      toast({ title: "Missing fields", description: "Recipient, subject and body are required.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const ccList = cc
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const { data, error } = await supabase.functions.invoke("send-ai-draft-email", {
        body: {
          claimId: claimId ?? null,
          claimNumber: claimNumber ?? null,
          patientName: patientName ?? null,
          insurerName: insurerName ?? null,
          hospitalName: hospitalName ?? null,
          recipientEmail: to.trim(),
          ccEmails: ccList,
          subject: subject.trim(),
          body,
          tool: tool ?? null,
          attachmentPaths: attachments.map((a) => a.path),
          actingUserId: getActingUserId(),
        },
      });
      if (error) throw error;
      const errMsg = (data as { error?: string })?.error;
      if (errMsg) throw new Error(errMsg);

      toast({
        title: "Email sent (sandbox mode)",
        description: `Routed to test inbox. Logged to claim timeline.`,
      });
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      toast({ title: "Send failed", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>Send AI Draft via Email</DialogTitle>
              <DialogDescription className="text-xs">
                Review & send the drafted text to the TPA / insurer contact. Attachments and a timeline entry will be saved against this claim.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Sandbox notice */}
        <div className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40 p-2.5 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>Sandbox mode — emails are routed to your test inbox. The full timeline entry and attachments still log against the claim.</span>
        </div>

        {/* Contact picker */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Pick saved contact {insurerName && <span className="text-muted-foreground/70">— suggesting matches for "{insurerName}"</span>}
          </Label>
          <Select value={contactId} onValueChange={handleContactPick}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={contacts.length ? "Choose a saved contact…" : "No contacts saved — type the email below"} />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {contacts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="font-medium">{c.contact_name}</span>
                  <span className="text-muted-foreground"> · {c.provider}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {matchedContact && contactId === matchedContact.id && (
            <Badge variant="outline" className="text-[10px]">
              Matched primary contact for {matchedContact.provider}
            </Badge>
          )}
          {!matchedContact && spoc.tpaSpoc && recipientSource === "profile" && (
            <div className="rounded-md border border-accent/30 bg-accent/5 p-2 text-[11px] flex items-start gap-2">
              <Mail className="h-3 w-3 text-accent shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">
                  Auto-filled from TPA profile · {spoc.profile?.name}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  L1 escalation: <span className="font-medium text-foreground">{spoc.tpaSpoc.name}</span>
                  {" "}({spoc.tpaSpoc.designation || "SPOC"}).
                  {spoc.tpaSpocL2 && ` L2 added to CC.`}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">To *</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="claims@tpa.com" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">CC (comma separated)</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="rm@tpa.com, escalation@tpa.com" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject *</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Body (editable AI draft) *</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="font-mono text-xs leading-relaxed"
            />
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Paperclip className="h-3 w-3" /> Attachments ({attachments.length})
            </Label>
            <div className="space-y-1">
              {attachments.map((a) => (
                <div key={a.path} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded border border-border bg-card">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{a.name}</span>
                  {typeof a.size === "number" && (
                    <span className="text-muted-foreground">{(a.size / 1024).toFixed(0)} KB</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <Button onClick={handleSend} disabled={sending || !to || !subject || !body} className="w-full gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? "Sending…" : "Send & log to claim timeline"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
