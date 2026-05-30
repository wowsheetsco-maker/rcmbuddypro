import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FileText, Save, RotateCcw, Loader2, Sparkles, Tags } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_SUBJECT_TEMPLATES, SUBJECT_TOKENS,
  renderSubjectTemplate, useSubjectTemplates,
  type SubjectTemplateKey, type SubjectTemplates,
} from "@/hooks/useAppSettings";

const TOOL_META: Record<SubjectTemplateKey, { title: string; subtitle: string }> = {
  appeal_letter: {
    title: "Appeal Letter",
    subtitle: "Used when sending denial appeals to TPA / Insurer.",
  },
  query_reply: {
    title: "Query Reply",
    subtitle: "Used when replying to TPA / Insurer queries on cashless claims.",
  },
  discharge_summary: {
    title: "Discharge Summary",
    subtitle: "Used when sending the AI-generated discharge summary by email.",
  },
  insurer_email: {
    title: "Insurer Email",
    subtitle: "Used for routine follow-ups, escalations, and reconciliation emails.",
  },
};

// Sample tokens for live preview — chosen to match a typical Indian cashless claim.
const PREVIEW_TOKENS: Record<string, string> = {
  claim_ref: "CLM-2025-001",
  patient: "Ramesh Kumar",
  patient_dot: " · Ramesh Kumar",
  patient_or_ref: "Ramesh Kumar",
  insurer: "Medi Assist",
  insurer_dot: " · Medi Assist",
  amount: "85,000",
  amount_dash: " — ₹85,000",
  reason: "Document Deficiency",
  reason_paren: " (Document Deficiency)",
  purpose: "Escalation",
};

export default function SubjectTemplatesPage() {
  const { templates, loading, saving, save } = useSubjectTemplates();
  const [draft, setDraft] = useState<SubjectTemplates>(DEFAULT_SUBJECT_TEMPLATES);

  useEffect(() => { setDraft(templates); }, [templates]);

  const dirty = (Object.keys(draft) as SubjectTemplateKey[])
    .some((k) => draft[k] !== templates[k]);

  const handleSave = async () => {
    const err = await save(draft);
    if (err) {
      toast.error("Failed to save templates", { description: err.message });
      return;
    }
    toast.success("Subject templates saved", {
      description: "New emails sent from AI tools will use these templates.",
    });
  };

  const handleReset = (k: SubjectTemplateKey) =>
    setDraft((d) => ({ ...d, [k]: DEFAULT_SUBJECT_TEMPLATES[k] }));

  return (
    <AppLayout>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-primary/10 text-primary">
            <Tags className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-display">Subject Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Customize the email subject line used when sending AI-drafted communications.
              Claim reference, patient name and ₹ amounts are auto-inserted via tokens.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || saving}
              onClick={() => setDraft(templates)}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset all
            </Button>
            <Button
              size="sm"
              disabled={!dirty || saving}
              onClick={handleSave}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save changes
            </Button>
          </div>
        </div>

        {/* Token reference */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Available tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SUBJECT_TOKENS.map((t) => (
                <div key={t.token} className="flex items-center gap-3 rounded border bg-muted/40 px-2.5 py-1.5">
                  <code className="text-[11px] font-mono bg-background border rounded px-1.5 py-0.5 shrink-0">
                    {t.token}
                  </code>
                  <span className="text-xs text-muted-foreground">{t.description}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 italic">
              Tip: tokens ending in <code className="text-[10px]">_dot</code>, <code className="text-[10px]">_paren</code>,
              <code className="text-[10px]">_dash</code> include their separator only when the value exists,
              so subjects stay clean even when fields are blank.
            </p>
          </CardContent>
        </Card>

        {/* Per-tool editors */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading templates…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {(Object.keys(TOOL_META) as SubjectTemplateKey[]).map((k) => {
              const meta = TOOL_META[k];
              const value = draft[k] ?? "";
              const preview = renderSubjectTemplate(value, PREVIEW_TOKENS);
              const changed = value !== templates[k];
              const isDefault = value === DEFAULT_SUBJECT_TEMPLATES[k];
              return (
                <Card key={k} className={changed ? "border-primary/50" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" /> {meta.title}
                          {changed && <Badge variant="outline" className="text-[9px]">Unsaved</Badge>}
                          {isDefault && !changed && <Badge variant="secondary" className="text-[9px]">Default</Badge>}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{meta.subtitle}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => handleReset(k)}
                        disabled={isDefault}
                      >
                        <RotateCcw className="h-3 w-3" /> Reset
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Template
                      </Label>
                      <Input
                        value={value}
                        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                        className="h-9 text-sm font-mono"
                        spellCheck={false}
                      />
                    </div>
                    <Separator />
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Live preview (using sample data)
                      </Label>
                      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium break-words">
                        {preview || <span className="text-muted-foreground italic">—</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
