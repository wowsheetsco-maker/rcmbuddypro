import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Upload, X, Copy, Download, Loader2, FileText, Image as ImageIcon,
  Mail, FileWarning, ClipboardList, MessageSquareWarning, AlertCircle, Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrgId } from "@/lib/currentOrg";
import { useAiProviders, PROVIDER_META, type ProviderKind } from "@/hooks/useAiProviders";
import { useSubjectTemplates, renderSubjectTemplate } from "@/hooks/useAppSettings";
import AiEmailSendDialog from "@/components/AiEmailSendDialog";

export type AiTool = "appeal_letter" | "query_reply" | "discharge_summary" | "insurer_email";

export const TOOL_META: Record<AiTool, {
  title: string;
  subtitle: string;
  icon: typeof Sparkles;
  accent: string;
  fields: Array<{
    key: string;
    label: string;
    type?: "text" | "textarea" | "number" | "select";
    placeholder?: string;
    options?: string[];
    fullWidth?: boolean;
    required?: boolean;
    rows?: number;
  }>;
  acceptedAttachments: string;
  attachmentHint: string;
}> = {
  appeal_letter: {
    title: "Generate Appeal Letter",
    subtitle: "Draft a strong, SLA-compliant denial appeal with clinical justification.",
    icon: FileWarning,
    accent: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
    fields: [
      { key: "claim_reference", label: "Claim Reference", placeholder: "CLM-2025-001", required: true },
      { key: "patient_name", label: "Patient Name", placeholder: "Ramesh Kumar", required: true },
      { key: "tpa_insurer", label: "TPA / Insurer", placeholder: "Medi Assist", required: true },
      { key: "denied_amount", label: "Denied Amount (₹)", type: "number", placeholder: "85000" },
      { key: "denial_reason", label: "Denial Reason", type: "select",
        options: ["Document Deficiency", "Non-medical Items", "Pre-existing Disease", "Policy Exclusion", "Length of Stay", "Treatment Not Covered", "Other"] },
      { key: "appeal_basis", label: "Appeal Basis", type: "select",
        options: ["Documents Provided", "Medical Necessity", "Policy Coverage Misinterpreted", "Cashless Pre-auth Granted", "Treating Doctor's Justification"] },
      { key: "additional_context", label: "Additional Context (optional)", type: "textarea", fullWidth: true,
        placeholder: "Clinical details, documents ready, policy clauses, special circumstances…", rows: 3 },
    ],
    acceptedAttachments: ".pdf,.png,.jpg,.jpeg,.webp",
    attachmentHint: "Attach denial letter + discharge summary for stronger context.",
  },
  query_reply: {
    title: "AI Claim Query Reply",
    subtitle: "Draft a strong, medically-justified reply to TPA queries — maximise first-pass approval.",
    icon: MessageSquareWarning,
    accent: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
    fields: [
      { key: "claim_reference", label: "Claim Reference", placeholder: "CLM-2025-001", required: true },
      { key: "patient_name", label: "Patient Name", placeholder: "Sunita Sharma", required: true },
      { key: "tpa_insurer", label: "TPA / Insurer", placeholder: "Paramount TPA", required: true },
      { key: "claimed_amount", label: "Claimed Amount (₹)", type: "number", placeholder: "95000" },
      { key: "query_text", label: "Query Raised by TPA / Insurer", type: "textarea", fullWidth: true,
        placeholder: "Paste the exact query text from the TPA/insurer here…", rows: 4, required: true },
      { key: "clinical_details", label: "Patient Clinical Details / Response Basis", type: "textarea", fullWidth: true,
        placeholder: "Diagnosis, treatment given, documents available, clinical justification…", rows: 4 },
    ],
    acceptedAttachments: ".pdf,.png,.jpg,.jpeg,.webp",
    attachmentHint: "Attach query letter + investigation reports for accurate point-by-point reply.",
  },
  discharge_summary: {
    title: "AI Discharge Summary Generator",
    subtitle: "Generate a clinically accurate discharge summary optimised for insurance approval (NABH + SLA aligned).",
    icon: ClipboardList,
    accent: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
    fields: [
      { key: "patient_name", label: "Patient Name", placeholder: "Ramesh Kumar", required: true },
      { key: "age_gender", label: "Age / Gender", placeholder: "55 / Male" },
      { key: "diagnosis", label: "Diagnosis / ICD", placeholder: "Acute MI – I21.9", required: true },
      { key: "tpa_insurer", label: "TPA / Insurer", placeholder: "Star Health" },
      { key: "admission_date", label: "Admission Date", placeholder: "01 Jan 2025" },
      { key: "discharge_date", label: "Discharge Date", placeholder: "07 Jan 2025" },
      { key: "claimed_amount", label: "Claimed Amount (₹)", type: "number", placeholder: "180000" },
      { key: "department", label: "Department", placeholder: "Cardiology ICU" },
      { key: "clinical_details", label: "Chief Complaints & Treatment Details", type: "textarea", fullWidth: true,
        placeholder: "Chief complaints, procedures performed, investigations, medications given…", rows: 5, required: true },
    ],
    acceptedAttachments: ".pdf,.png,.jpg,.jpeg,.webp",
    attachmentHint: "Attach lab reports / OT notes for richer clinical detail.",
  },
  insurer_email: {
    title: "AI Email to Insurer",
    subtitle: "Generate a professional email to insurer/TPA for follow-up, escalation or reconciliation.",
    icon: Mail,
    accent: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
    fields: [
      { key: "to_email", label: "To (TPA / Insurer Email)", placeholder: "claims@tpa.com, rm@tpa.com", fullWidth: true, required: true },
      { key: "claim_reference", label: "Claim Reference", placeholder: "CLM-2025-003" },
      { key: "patient_name", label: "Patient Name", placeholder: "Anil Verma" },
      { key: "tpa_insurer", label: "TPA / Insurer Name", placeholder: "Vidal Health TPA" },
      { key: "outstanding_amount", label: "Outstanding Amount (₹)", type: "number", placeholder: "145000" },
      { key: "admission_date", label: "Date of Admission", placeholder: "DD/MM/YYYY" },
      { key: "discharge_date", label: "Date of Discharge", placeholder: "DD/MM/YYYY" },
      { key: "days_pending", label: "Days Pending", type: "number", placeholder: "45" },
      { key: "email_purpose", label: "Email Purpose", type: "select",
        options: ["Routine Follow-up", "Escalation", "SLA Notice", "Payment Reconciliation", "Meeting Request — Bulk Settlement", "Discrepancy Dispute"] },
      { key: "specific_issue", label: "Specific Issue / Pending Item", type: "textarea", fullWidth: true,
        placeholder: "Describe the specific issue, pending item, or what you need from the insurer…", rows: 3 },
    ],
    acceptedAttachments: ".pdf,.png,.jpg,.jpeg,.webp",
    attachmentHint: "Attach related correspondence or claim breakdown for context.",
  },
};

interface AiToolDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tool: AiTool;
  /** Optional pre-fill from claim/context */
  initialValues?: Record<string, string | number>;
  claimId?: string | null;
  /** Used by the "Send via Email" action: contact lookup + timeline log. */
  claimNumber?: string | null;
  patientName?: string | null;
  insurerName?: string | null;
  hospitalName?: string | null;
  /** Notifies parent so it can refresh communication timeline after a draft. */
  onDraftSaved?: () => void;
}

interface UploadedFile { name: string; path: string; size: number; type: string }

export default function AiToolDialog({
  open, onOpenChange, tool,
  initialValues, claimId, claimNumber, patientName, insurerName, hospitalName,
  onDraftSaved,
}: AiToolDialogProps) {
  const meta = TOOL_META[tool];
  const Icon = meta.icon;
  const { providers, defaultProvider, loading: provLoading } = useAiProviders();
  const { templates: subjectTemplates } = useSubjectTemplates();
  const { toast } = useToast();

  const [values, setValues] = useState<Record<string, string>>({});
  const [providerId, setProviderId] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      if (initialValues) for (const [k, v] of Object.entries(initialValues)) init[k] = String(v ?? "");
      setValues(init);
      setOutput("");
      setFiles([]);
      if (defaultProvider) {
        setProviderId(defaultProvider.id);
        setModel(defaultProvider.default_model ?? "");
      }
    }
  }, [open, initialValues, defaultProvider]);

  const activeProviders = useMemo(() => providers.filter((p) => p.is_active), [providers]);
  const selectedProvider = providers.find((p) => p.id === providerId);
  const availableModels = selectedProvider
    ? PROVIDER_META[selectedProvider.provider as ProviderKind]?.models ?? []
    : [];

  const handleProviderChange = (id: string) => {
    setProviderId(id);
    const p = providers.find((x) => x.id === id);
    setModel(p?.default_model ?? "");
  };

  const handleFiles = async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    setUploading(true);
    const newOnes: UploadedFile[] = [];
    for (const f of Array.from(selected)) {
      if (f.size > 15 * 1024 * 1024) {
        toast({ title: `${f.name} skipped`, description: "Max 15 MB per file.", variant: "destructive" });
        continue;
      }
      const orgId = getCurrentOrgId();
      const path = `${orgId}/${tool}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.name}`;
      const { error } = await supabase.storage.from("ai-attachments").upload(path, f);
      if (error) {
        toast({ title: `Upload failed: ${f.name}`, description: error.message, variant: "destructive" });
        continue;
      }
      newOnes.push({ name: f.name, path, size: f.size, type: f.type });
    }
    setFiles((prev) => [...prev, ...newOnes]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = async (f: UploadedFile) => {
    await supabase.storage.from("ai-attachments").remove([f.path]);
    setFiles((prev) => prev.filter((x) => x.path !== f.path));
  };

  const generate = async () => {
    // Validate required
    const missing = meta.fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length) {
      toast({ title: "Missing fields", description: missing.map((m) => m.label).join(", "), variant: "destructive" });
      return;
    }
    if (!providerId) {
      toast({ title: "Choose an AI provider", description: "Add a provider in Settings → AI Providers first.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setOutput("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-generate", {
        body: {
          tool,
          providerId,
          model: model || undefined,
          formData: values,
          attachmentPaths: files.map((f) => f.path),
          claimId: claimId ?? null,
        },
      });
      if (error) throw error;
      const errMsg = (data as { error?: string })?.error;
      if (errMsg) throw new Error(errMsg);
      setOutput((data as { output?: string })?.output ?? "");
      toast({ title: "Draft ready", description: `${selectedProvider?.display_name} · ${(data as { model?: string })?.model}` });
      onDraftSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      toast({ title: "AI generation failed", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyOutput = async () => {
    await navigator.clipboard.writeText(output);
    toast({ title: "Copied to clipboard" });
  };

  const downloadOutput = () => {
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tool}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-md ${meta.accent}`}><Icon className="h-4 w-4" /></div>
            <div>
              <DialogTitle>{meta.title}</DialogTitle>
              <DialogDescription className="text-xs">{meta.subtitle}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Provider strip */}
        <div className="rounded-md border border-border bg-muted/30 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">AI Provider</Label>
            {activeProviders.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                {provLoading ? "Loading…" : "No providers — add one in Settings → AI Providers"}
              </div>
            ) : (
              <Select value={providerId} onValueChange={handleProviderChange}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activeProviders.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name} <span className="text-muted-foreground">· {PROVIDER_META[p.provider as ProviderKind]?.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Model</Label>
            <Select value={model} onValueChange={setModel} disabled={!availableModels.length}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Provider default" /></SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Form fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {meta.fields.map((f) => (
            <div key={f.key} className={`space-y-1.5 ${f.fullWidth ? "sm:col-span-2" : ""}`}>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {f.label}{f.required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              {f.type === "textarea" ? (
                <Textarea
                  rows={f.rows ?? 3}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="text-sm"
                />
              ) : f.type === "select" ? (
                <Select value={values[f.key] ?? ""} onValueChange={(v) => setValues((vv) => ({ ...vv, [f.key]: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {f.options?.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : "text"}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="h-9 text-sm"
                />
              )}
            </div>
          ))}
        </div>

        {/* Attachments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Attach Documents (denial letter, query letter, reports — for richer context)
            </Label>
            <Badge variant="outline" className="text-[10px]">{files.length} file{files.length === 1 ? "" : "s"}</Badge>
          </div>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-md p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <Upload className="h-5 w-5 text-muted-foreground mx-auto mb-1.5" />
            <p className="text-xs font-medium">Click to upload PDF or image</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{meta.attachmentHint} Max 15 MB each.</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={meta.acceptedAttachments}
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
          {uploading && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</p>}
          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f) => (
                <div key={f.path} className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-card text-xs">
                  {f.type.startsWith("image") ? <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeFile(f)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generate button */}
        <Button onClick={generate} disabled={generating || !providerId} className="w-full gap-2">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Drafting with AI…" : `Generate ${meta.title.replace("Generate ", "").replace("AI ", "")}`}
        </Button>

        {/* Output */}
        {output && (
          <div className="space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">AI Draft (editable)</Label>
              <div className="flex items-center gap-1 flex-wrap">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={copyOutput}>
                  <Copy className="h-3 w-3" /> Copy
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={downloadOutput}>
                  <Download className="h-3 w-3" /> Download
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setEmailOpen(true)}
                  disabled={!output.trim()}
                >
                  <Send className="h-3 w-3" /> Send via Email
                </Button>
              </div>
            </div>
            <Textarea
              value={output}
              onChange={(e) => setOutput(e.target.value)}
              rows={14}
              className="font-mono text-xs leading-relaxed"
            />
            {claimId && (
              <p className="text-[10px] text-muted-foreground italic">
                ✓ Draft auto-saved to this claim's communication timeline.
              </p>
            )}
          </div>
        )}
      </DialogContent>

      <AiEmailSendDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        draftBody={presetBody(tool, output, values)}
        defaultSubject={renderSubjectTemplate(
          subjectTemplates[tool],
          buildSubjectTokens(values, claimNumber, patientName),
        )}
        tool={tool}
        claimId={claimId ?? null}
        claimNumber={claimNumber ?? (values.claim_reference || null)}
        patientName={patientName ?? (values.patient_name || null)}
        insurerName={insurerName ?? (values.tpa_insurer || null)}
        hospitalName={hospitalName ?? null}
        attachments={files.map((f) => ({ name: f.name, path: f.path, size: f.size }))}
        initialTo={values.to_email}
        onSent={onDraftSaved}
      />
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Subject + body presets — populate "Send via Email" dialog with a
 * professional, ready-to-edit shell so users don't start from blank.
 * ──────────────────────────────────────────────────────────────── */

/** Build the token map consumed by `renderSubjectTemplate`. */
function buildSubjectTokens(
  values: Record<string, string>,
  claimNumber?: string | null,
  patientName?: string | null,
): Record<string, string> {
  const ref = values.claim_reference || claimNumber || "";
  const pat = values.patient_name || patientName || "";
  const insurer = values.tpa_insurer || "";
  const reason = values.denial_reason || "";
  const purpose = values.email_purpose || "Follow-up";

  const amountRaw = Number(values.denied_amount || values.outstanding_amount || values.claimed_amount || 0);
  const amountStr = amountRaw > 0 ? amountRaw.toLocaleString("en-IN") : "";

  return {
    claim_ref: ref,
    patient: pat,
    patient_dot: pat ? ` · ${pat}` : "",
    patient_or_ref: pat || ref,
    insurer,
    insurer_dot: insurer ? ` · ${insurer}` : "",
    amount: amountStr,
    amount_dash: amountStr ? ` — ₹${amountStr}` : "",
    reason,
    reason_paren: reason ? ` (${reason})` : "",
    purpose,
  };
}

/** Wrap the AI output with greeting + sign-off if the model didn't include one. */
function presetBody(
  tool: AiTool,
  output: string,
  values: Record<string, string>,
): string {
  if (!output.trim()) return output;

  // If the draft already starts with a salutation, leave it alone — model nailed it.
  const startsWithGreeting = /^(dear|to|respected|hello|hi)\b/i.test(output.trim().split("\n")[0] ?? "");
  const endsWithSignoff = /(regards|sincerely|thank you|thanks)[\s,.]*$/i.test(output.trim().split("\n").slice(-3).join("\n"));

  if (startsWithGreeting && endsWithSignoff) return output;

  const insurer = values.tpa_insurer?.trim();
  const greeting = startsWithGreeting
    ? ""
    : `Dear ${insurer ? `${insurer} Team` : "Claims Team"},\n\n`;

  // Tool-specific opener line above the AI body — tightens context for the reader.
  const opener = (() => {
    if (startsWithGreeting) return "";
    switch (tool) {
      case "appeal_letter":
        return values.claim_reference
          ? `Sub: Appeal against denial of claim ${values.claim_reference}${values.patient_name ? ` (Patient: ${values.patient_name})` : ""}.\n\n`
          : "";
      case "query_reply":
        return values.claim_reference
          ? `Sub: Point-by-point reply to your query on claim ${values.claim_reference}${values.patient_name ? ` (Patient: ${values.patient_name})` : ""}.\n\n`
          : "";
      case "insurer_email":
        return values.claim_reference
          ? `Sub: ${values.email_purpose || "Follow-up"} on claim ${values.claim_reference}${values.outstanding_amount ? ` — outstanding ₹${Number(values.outstanding_amount).toLocaleString("en-IN")}` : ""}.\n\n`
          : "";
      default:
        return "";
    }
  })();

  const signoff = endsWithSignoff
    ? ""
    : `\n\nRegards,\nHospital Insurance Desk`;

  return `${greeting}${opener}${output.trim()}${signoff}`;
}
