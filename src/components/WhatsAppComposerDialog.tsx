import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, ExternalLink, Loader2, Sparkles, RotateCcw, Variable, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  buildWhatsAppUrl,
  logWhatsAppClick,
  updateWhatsAppLog,
  normalizeWhatsAppNumber,
  renderTemplate,
  type ClaimContext,
} from "@/lib/whatsapp";
import { sendWhatsApp } from "@/lib/whatsapp.functions";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { useWhatsAppApiSettings } from "@/hooks/useWhatsAppApiSettings";
import { useWhatsAppTemplates, type WhatsAppTemplate } from "@/hooks/useWhatsAppTemplates";

/** Available {{tokens}} the renderer understands, with friendly labels. */
const AVAILABLE_VARIABLES: Array<{ token: keyof ClaimContext | string; label: string; hint: string }> = [
  { token: "patient_name",            label: "Patient name",          hint: "Patient on the claim" },
  { token: "claim_number",            label: "Claim number",          hint: "TPA / insurer claim ref" },
  { token: "hospital_name",           label: "Hospital name",         hint: "Treating hospital" },
  { token: "outstanding_amount",      label: "Outstanding amount",    hint: "Pending balance, formatted in INR" },
  { token: "days_since_claim",        label: "Days since claim",      hint: "Aging in days" },
  { token: "tpa_name",                label: "TPA name",              hint: "Third-party administrator" },
  { token: "tpa_spoc_name",           label: "TPA SPOC",              hint: "Single point of contact at TPA" },
  { token: "insurance_company_name",  label: "Insurance company",     hint: "Underwriting insurer" },
  { token: "last_communication_note", label: "Last communication",    hint: "Most recent note logged" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Claim DB row id — used to log to Communication Log. */
  claimId: string;
  /** Recipient phone number (raw, will be normalized). */
  recipient: string | null | undefined;
  /** Recipient label shown to the user (e.g. "Patient: Rahul"). */
  recipientLabel?: string;
  /** Default audience to pre-filter by (cfo / billing / ops / any). */
  defaultRole?: string;
  /** Variables used to render template tokens. */
  context: ClaimContext;
  /** Optional acting user for the audit trail. */
  performedBy?: string | null;
}

const ROLE_OPTIONS = [
  { value: "any",     label: "All roles"    },
  { value: "cfo",     label: "CFO"          },
  { value: "billing", label: "Billing"      },
  { value: "claims",  label: "Claims"       },
  { value: "spoc",    label: "SPOC"         },
  { value: "ops",     label: "Ops"          },
];

/**
 * Per-claim memory of the user's last role filter + selected template id.
 * Module-level so it survives dialog unmount but resets on full page reload.
 * Keyed by claim id so different rows don't bleed into each other.
 */
const lastPickByClaim = new Map<string, { role: string; templateId: string | null }>();

const CATEGORY_TONE: Record<string, string> = {
  tpa:      "bg-primary/10 text-primary border-primary/30",
  patient:  "bg-success/10 text-success border-success/30",
  insurer:  "bg-warning/15 text-warning border-warning/40",
  internal: "bg-muted text-muted-foreground border-border",
};

/**
 * One-stop dialog: pick a role-tagged template, preview/edit the rendered
 * message, then open WhatsApp. The click is logged to Communication Log.
 */
export default function WhatsAppComposerDialog({
  open,
  onOpenChange,
  claimId,
  recipient,
  recipientLabel,
  defaultRole = "any",
  context,
  performedBy,
}: Props) {
  const { templates, loading } = useWhatsAppTemplates();

  // Row-action menus pass semantic roles (billing / claims / spoc / cfo / ops).
  // These are all first-class options now — fall back to "any" only for
  // genuinely unknown values so the Select never renders empty.
  const normalizeRole = (r: string | undefined): string => {
    const valid = new Set(ROLE_OPTIONS.map((o) => o.value));
    return r && valid.has(r) ? r : "any";
  };

  // On reopen, prefer the user's last pick for THIS claim over the role
  // implied by which row-action button they clicked — so switching between
  // "Billing follow-up" and "SPOC escalation" on the same row remembers
  // whatever they last chose inside the composer.
  const resolveInitialRole = () => {
    const remembered = claimId ? lastPickByClaim.get(claimId)?.role : undefined;
    return normalizeRole(remembered ?? defaultRole);
  };

  const [roleFilter, setRoleFilter] = useState(resolveInitialRole);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => (claimId ? lastPickByClaim.get(claimId)?.templateId ?? null : null),
  );
  const [phone, setPhone] = useState(recipient ?? "");
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Reset state whenever the dialog opens — but restore the per-claim memory
  // for role + selected template so re-opening from a different row action
  // doesn't clobber what the user was working on.
  useEffect(() => {
    if (open) {
      const remembered = claimId ? lastPickByClaim.get(claimId) : undefined;
      setRoleFilter(normalizeRole(remembered?.role ?? defaultRole));
      setSelectedId(remembered?.templateId ?? null);
      setPhone(recipient ?? "");
      setBody("");
      setEdited(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultRole, recipient, claimId]);

  // Persist role + selected template per claim whenever they change.
  useEffect(() => {
    if (!open || !claimId) return;
    lastPickByClaim.set(claimId, { role: roleFilter, templateId: selectedId });
  }, [open, claimId, roleFilter, selectedId]);

  /**
   * Templates for the active role filter, with smart fallback:
   * - exact role matches come first,
   * - then "any"-tagged templates as the closest fallback,
   * - hides nothing so the user can always see what's available.
   * `isFallback` flags an entry that doesn't match the requested role exactly.
   */
  const filtered = useMemo(() => {
    type Entry = WhatsAppTemplate & { isFallback: boolean };
    if (roleFilter === "any") {
      return templates.map<Entry>((t) => ({ ...t, isFallback: false }));
    }
    const exact: Entry[] = [];
    const fallback: Entry[] = [];
    for (const t of templates) {
      if (t.audience_role === roleFilter) exact.push({ ...t, isFallback: false });
      else if (t.audience_role === "any") fallback.push({ ...t, isFallback: true });
    }
    return [...exact, ...fallback];
  }, [templates, roleFilter]);

  const hasExactMatch = useMemo(
    () => roleFilter === "any" || filtered.some((t) => !t.isFallback),
    [filtered, roleFilter],
  );

  // Auto-select first template when filter changes / templates load
  useEffect(() => {
    if (!open) return;
    if (selectedId && filtered.some((t) => t.id === selectedId)) return;
    const first = filtered[0];
    if (first) {
      setSelectedId(first.id);
      setBody(renderTemplate(first.body, context));
      setEdited(false);
    }
  }, [filtered, open, selectedId, context]);

  function pickTemplate(t: WhatsAppTemplate) {
    setSelectedId(t.id);
    setBody(renderTemplate(t.body, context));
    setEdited(false);
  }

  /** Insert a {{token}} at the cursor in the textarea (rendered immediately). */
  function insertVariable(token: string) {
    const ta = textareaRef.current;
    const placeholder = `{{${token}}}`;
    const rendered = renderTemplate(placeholder, context);
    if (!ta) {
      setBody((prev) => prev + rendered);
      setEdited(true);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + rendered + body.slice(end);
    setBody(next);
    setEdited(true);
    // restore cursor right after the inserted value
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + rendered.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function resetRecipient() {
    setPhone(recipient ?? "");
  }

  const selected = filtered.find((t) => t.id === selectedId) ?? null;
  const normalized = normalizeWhatsAppNumber(phone);
  const recipientChanged = (recipient ?? "") !== phone && (recipient ?? "").trim().length > 0;
  const canSend = !!normalized && body.trim().length > 0;

  const sendWhatsAppFn = useServerFn(sendWhatsApp);
  const { settings: waApiSettings } = useWhatsAppApiSettings();
  const apiEnabled = waApiSettings.enabled;
  const [sending, setSending] = useState(false);

  async function handleSend(mode: "api" | "device" = apiEnabled ? "api" : "device") {
    if (!canSend) {
      toast.error("Enter a valid WhatsApp number and message");
      return;
    }
    const recipientDigits = normalized!;

    if (mode === "device") {
      const url = buildWhatsAppUrl(phone, body);
      if (!url) {
        toast.error("Could not build WhatsApp link");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
      await logWhatsAppClick({
        claim_id: claimId,
        recipient: recipientDigits,
        template_name: selected?.name ?? (edited ? "Custom message" : null),
        audience_role: selected?.audience_role ?? null,
        body_preview: body,
        performed_by: performedBy ?? null,
        status: "sent",
      });
      toast.success("WhatsApp opened — logged to Communication Log");
      onOpenChange(false);
      return;
    }

    // API mode: log as queued first, then call server fn, patch row with result.
    setSending(true);
    const rowId = await logWhatsAppClick({
      claim_id: claimId,
      recipient: recipientDigits,
      template_name: selected?.name ?? (edited ? "Custom message" : null),
      audience_role: selected?.audience_role ?? null,
      body_preview: body,
      performed_by: performedBy ?? null,
      status: "queued",
    });

    try {
      const result = await sendWhatsAppFn({
        data: {
          to: recipientDigits,
          template_name: selected?.name ?? "custom_message",
          variables: [body],
          language_code: "en",
          org_id: getCurrentOrgId(),
        },
      });
      if (result.ok) {
        if (rowId) {
          await updateWhatsAppLog(rowId, {
            status: "sent",
            provider_message_id: result.message_id ?? null,
          });
        }
        toast.success("WhatsApp message queued via Business API");
        onOpenChange(false);
      } else {
        if (rowId) {
          await updateWhatsAppLog(rowId, {
            status: "failed",
            error_message: result.error ?? "Unknown error",
          });
        }
        toast.error(result.error ?? "Failed to send via API");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (rowId) await updateWhatsAppLog(rowId, { status: "failed", error_message: msg });
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-whatsapp" />
            Send WhatsApp
            <Badge
              variant="outline"
              className={`ml-1 text-[10px] py-0 h-5 ${
                apiEnabled
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted text-muted-foreground border-border"
              }`}
              title={
                apiEnabled
                  ? "This hospital sends via WhatsApp Business API"
                  : "This hospital uses wa.me deep links"
              }
            >
              {apiEnabled ? "Business API" : "wa.me"}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {apiEnabled
              ? "Pick a template, edit if needed, then send via Business API. Every send is recorded in Communication Log."
              : "Pick a template, edit if needed, then open the chat. Every send is recorded in Communication Log."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 flex-1 overflow-hidden">
          {/* Template list */}
          <div className="flex flex-col gap-2 min-h-0">
            <div>
              <Label className="text-xs">Audience role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between mt-1">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
                Templates ({filtered.length})
              </span>
              {!hasExactMatch && filtered.length > 0 && (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[9px] py-0 h-4 bg-warning/10 text-warning border-warning/40 cursor-help gap-0.5">
                        <Info className="h-2.5 w-2.5" /> Fallback
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-[220px]">
                      No template tagged for <b className="capitalize">{roleFilter}</b> yet — showing closest <b>"any"</b> templates instead.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-1.5">
              {loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-3">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading templates…
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="text-xs text-muted-foreground p-3 border rounded">
                  No templates for this role. Switch filter or write a custom message on the right.
                </div>
              )}
              {filtered.map((t) => {
                const active = t.id === selectedId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickTemplate(t)}
                    className={`w-full text-left rounded-md border p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="text-xs font-semibold leading-tight">{t.name}</span>
                      {t.is_system && <Sparkles className="h-3 w-3 text-muted-foreground" aria-label="System template" />}
                      {t.isFallback && (
                        <Badge variant="outline" className="text-[8px] py-0 h-3.5 bg-warning/10 text-warning border-warning/40">
                          fallback
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="outline" className={`text-[9px] py-0 h-4 capitalize ${CATEGORY_TONE[t.category] ?? ""}`}>
                        {t.category}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] py-0 h-4 capitalize">
                        {t.audience_role}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Editor */}
          <div className="flex flex-col min-h-0 gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    Recipient {recipientLabel && <span className="text-muted-foreground">· {recipientLabel}</span>}
                  </Label>
                  {recipientChanged && (
                    <button
                      type="button"
                      onClick={resetRecipient}
                      className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <RotateCcw className="h-2.5 w-2.5" /> Reset
                    </button>
                  )}
                </div>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="h-8 text-xs mt-1 font-mono"
                />
              </div>
              <div className="text-[10px] text-muted-foreground">
                {normalized ? (
                  <span className="text-success">→ wa.me/{normalized}</span>
                ) : (
                  <span className="text-destructive">Invalid number</span>
                )}
                {recipientChanged && normalized && (
                  <div className="text-warning mt-0.5">· overridden</div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-1">
              <Label className="text-xs">Message preview {edited && <span className="text-warning">· edited</span>}</Label>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1">
                      <Variable className="h-3 w-3" /> Insert variable
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-2 z-50 bg-popover">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1.5 px-1">
                      Available variables
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-0.5">
                      {AVAILABLE_VARIABLES.map((v) => {
                        const preview = renderTemplate(`{{${v.token}}}`, context);
                        const empty = preview === "—";
                        return (
                          <button
                            key={v.token as string}
                            type="button"
                            onClick={() => insertVariable(v.token as string)}
                            className="w-full text-left rounded px-2 py-1.5 hover:bg-muted/70 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium">{v.label}</span>
                              <code className="text-[9px] text-muted-foreground font-mono">
                                {`{{${v.token}}}`}
                              </code>
                            </div>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground truncate flex-1">{v.hint}</span>
                              <span className={`text-[10px] font-mono truncate max-w-[110px] ${empty ? "text-muted-foreground/60 italic" : "text-success"}`}>
                                → {preview}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-muted-foreground border-t mt-1.5 pt-1.5 px-1">
                      Click to insert at cursor. Empty variables render as <code>—</code>.
                    </div>
                  </PopoverContent>
                </Popover>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {body.length} chars
                </span>
              </div>
            </div>
            <Textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => { setBody(e.target.value); setEdited(true); }}
              rows={12}
              className="text-xs font-mono resize-none flex-1 min-h-[200px]"
              placeholder="Pick a template on the left or write a custom message…"
            />

            {/* Variables used — quick at-a-glance of which claim data is being injected */}
            <div className="rounded-md border bg-muted/30 p-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
                <Variable className="h-3 w-3" /> Variables used in this message
              </div>
              <div className="flex flex-wrap gap-1">
                {AVAILABLE_VARIABLES.map((v) => {
                  const val = renderTemplate(`{{${v.token}}}`, context);
                  const empty = val === "—" || !val;
                  return (
                    <Badge
                      key={v.token as string}
                      variant="outline"
                      className={`text-[10px] py-0 h-5 gap-1 ${empty ? "opacity-50" : ""}`}
                      title={`${v.hint} → ${val}`}
                    >
                      <span className="font-medium">{v.label}:</span>
                      <span className="font-mono truncate max-w-[120px]">{empty ? "—" : val}</span>
                    </Badge>
                  );
                })}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Variables in <code>{"{{double_braces}}"}</code> are replaced with claim data. Edit freely — what you see here is what will pre-fill in WhatsApp.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} size="sm">
            Cancel
          </Button>
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!canSend}
            size="sm"
            className="bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90"
          >
            <ExternalLink className="h-3 w-3 mr-1.5" />
            Review & Send
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Final confirmation — summary + recipient before opening WhatsApp */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-whatsapp" /> Confirm WhatsApp send
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2.5 text-xs">
                <div className="rounded-md border bg-muted/40 p-2.5 space-y-1.5">
                  <div>
                    <span className="text-muted-foreground">To:</span>{" "}
                    <span className="font-mono">+{normalized}</span>
                    {recipientLabel && <span className="text-muted-foreground"> · {recipientLabel}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected && (
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {selected.name} · {selected.audience_role}
                      </Badge>
                    )}
                    {edited && (
                      <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/40">
                        edited
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">{body.length} chars</Badge>
                  </div>
                  <div className="rounded bg-background border p-2 max-h-32 overflow-y-auto">
                    <pre className="text-[11px] font-mono whitespace-pre-wrap leading-snug">{body}</pre>
                  </div>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  {apiEnabled
                    ? "Sends via WhatsApp Business API and logs as queued — delivery status updates from Meta callbacks."
                    : "Opens WhatsApp with the message pre-filled and logs the click to Communication Log."}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            {apiEnabled && (
              <AlertDialogAction
                disabled={sending}
                className="text-xs bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90"
                onClick={() => { setConfirmOpen(false); void handleSend("api"); }}
              >
                {sending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <MessageCircle className="h-3 w-3 mr-1.5" />}
                Send via API
              </AlertDialogAction>
            )}
            <AlertDialogAction
              className="text-xs"
              onClick={() => { setConfirmOpen(false); void handleSend("device"); }}
            >
              <ExternalLink className="h-3 w-3 mr-1.5" />
              {apiEnabled ? "Send from device" : "Open WhatsApp"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
