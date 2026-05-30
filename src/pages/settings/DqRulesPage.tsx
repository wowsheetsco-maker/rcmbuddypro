// Settings → Data Quality Rules — editable thresholds for the 4-layer engine.
// Persists into the dq_rules table via useDqRules.

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save, Sliders, ShieldAlert, Layers } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useDqRules } from "@/hooks/useDqRules";
import { DEFAULT_DQ_RULES, type DqRules } from "@/lib/dataQualityEngine";

interface FieldDef {
  key: keyof DqRules;
  label: string;
  hint: string;
  unit: string;
  layer: 3 | 4 | 5;
  min: number;
  max: number;
  step: number;
}

const FIELDS: FieldDef[] = [
  { key: "submission_warn_days",     label: "Submission delay warning", hint: "Warn if doc not submitted within N days after discharge.", unit: "days", layer: 3, min: 1,  max: 14,  step: 1 },
  { key: "approval_escalate_days",   label: "Approval escalation",      hint: "Error if no approval N days after claim creation.",        unit: "days", layer: 3, min: 3,  max: 30,  step: 1 },
  { key: "settlement_critical_days", label: "Settlement critical",      hint: "Critical if no settlement N days after claim creation.",   unit: "days", layer: 3, min: 7,  max: 90,  step: 1 },
  { key: "zero_approval_risk_days",  label: "Zero-approval risk",       hint: "Flag claims with ₹0 approval older than N days.",          unit: "days", layer: 3, min: 3,  max: 30,  step: 1 },
  { key: "high_value_claim_inr",     label: "High-value outlier",       hint: "Claims above this amount are flagged for verification.",   unit: "₹",    layer: 4, min: 100000, max: 10000000, step: 50000 },
  { key: "min_approval_rate_pct",    label: "Minimum approval rate",    hint: "Aggregate approval rate target — warn if below this %.",   unit: "%",    layer: 4, min: 50, max: 100, step: 1 },
  { key: "max_denial_rate_pct",      label: "Maximum denial rate",      hint: "Aggregate denial rate ceiling — warn if above this %.",    unit: "%",    layer: 4, min: 1,  max: 50,  step: 1 },
  { key: "max_avg_tat_days",         label: "Maximum average TAT",      hint: "Average claim creation → payment days target.",            unit: "days", layer: 4, min: 7,  max: 120, step: 1 },
  // Discrepancy tracker thresholds
  { key: "discrepancy_min_inr",      label: "Discrepancy min ₹",        hint: "Flag if Approved − (Settled + TDS) > this amount.",         unit: "₹",    layer: 5, min: 0,    max: 50000, step: 100 },
  { key: "discrepancy_min_pct",      label: "Discrepancy min %",        hint: "Flag if shortfall is more than N% of Approved (whichever is larger).", unit: "%", layer: 5, min: 0, max: 25, step: 0.5 },
  { key: "discrepancy_low_pct",      label: "LOW band ceiling",         hint: "Discrepancy below N% of approved is classified LOW.",       unit: "%",    layer: 5, min: 1,  max: 20, step: 1 },
  { key: "discrepancy_high_pct",     label: "HIGH band floor",          hint: "Discrepancy above N% of approved is classified HIGH.",      unit: "%",    layer: 5, min: 5,  max: 50, step: 1 },
];

export default function DqRulesPage() {
  const { rules, loading, saving, save, reload } = useDqRules();
  const [draft, setDraft] = useState<DqRules>(rules);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(rules);
    setDirty(false);
  }, [rules]);

  const update = (k: keyof DqRules, v: number) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  const handleSave = async () => {
    const { error } = await save(draft);
    if (error) {
      toast.error("Failed to save rules", { description: error.message });
    } else {
      toast.success("DQ thresholds saved");
      setDirty(false);
    }
  };

  const handleReset = () => {
    setDraft(DEFAULT_DQ_RULES);
    setDirty(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display text-foreground flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              Data Quality Rules
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tune the 4-layer engine thresholds. Changes apply to import-time scoring and retroactive scans.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={loading || saving}>
              <RotateCcw className="h-4 w-4" /> Reset to defaults
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving || loading}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading thresholds…
            </CardContent>
          </Card>
        ) : (
          <>
            {[3, 4, 5].map((layer) => (
              <Card key={layer} className="shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    {layer === 5 ? "Discrepancy Tracker" : `Layer ${layer}`} ·{" "}
                    {layer === 3
                      ? "Business Logic & TAT"
                      : layer === 4
                        ? "Performance Ratios"
                        : "Short-payment thresholds & severity bands"}
                    <Badge variant="outline" className="ml-1 text-[10px]">
                      {FIELDS.filter((f) => f.layer === layer).length} thresholds
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-5">
                  {FIELDS.filter((f) => f.layer === layer).map((f) => (
                    <RuleField
                      key={f.key}
                      def={f}
                      value={draft[f.key]}
                      onChange={(v) => update(f.key, v)}
                    />
                  ))}
                </CardContent>
              </Card>
            ))}

            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="p-4 flex gap-3 items-start">
                <ShieldAlert className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="text-xs text-foreground/80 space-y-1">
                  <div className="font-semibold text-foreground">Layer 1 & Layer 2 are not editable.</div>
                  <div>
                    Mandatory headers (Claim #, Patient, Admission, Claimed, Status) and row-level critical
                    fields are part of the gold-standard contract. Loosening them would corrupt downstream
                    analytics — they intentionally stay locked.
                  </div>
                </div>
              </CardContent>
            </Card>

            {dirty && (
              <div className="sticky bottom-4 flex justify-end">
                <Card className="shadow-lg border-primary/40">
                  <CardContent className="p-3 flex items-center gap-3">
                    <span className="text-sm">You have unsaved changes</span>
                    <Button size="sm" variant="ghost" onClick={() => { setDraft(rules); setDirty(false); }}>
                      Discard
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function RuleField({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: number;
  onChange: (v: number) => void;
}) {
  const fmt = (v: number) =>
    def.unit === "₹" ? `₹${v.toLocaleString("en-IN")}` : `${v} ${def.unit}`;

  return (
    <div className="space-y-2 rounded-md border p-3 bg-background">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="text-sm font-semibold">{def.label}</Label>
          <p className="text-[11px] text-muted-foreground mt-0.5">{def.hint}</p>
        </div>
        <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0">
          {fmt(value)}
        </Badge>
      </div>
      <Slider
        value={[value]}
        min={def.min}
        max={def.max}
        step={def.step}
        onValueChange={([v]) => onChange(v)}
      />
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          min={def.min}
          max={def.max}
          step={def.step}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="h-8 text-xs w-32"
        />
        <span className="text-[11px] text-muted-foreground">
          range: {def.min.toLocaleString("en-IN")}–{def.max.toLocaleString("en-IN")}
        </span>
      </div>
    </div>
  );
}
