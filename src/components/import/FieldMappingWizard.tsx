import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import type { ClaimUpsertRow } from "@/lib/claimsImport";
import {
  MAPPABLE_FIELDS,
  HIMS_PRESETS,
  autoDetectMapping,
  applyPreset,
  computeReadiness,
  fieldLabel,
} from "@/lib/himsFieldMapping";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  detectedHeaders: string[];
  /** Initial mapping (from previous auto-detect) — header → field. */
  initialMapping?: Record<string, keyof ClaimUpsertRow>;
  onSave: (mapping: Record<string, keyof ClaimUpsertRow>) => void;
}

const NONE = "__none__";

export default function FieldMappingWizard({
  open,
  onOpenChange,
  detectedHeaders,
  initialMapping,
  onSave,
}: Props) {
  const [mapping, setMapping] = useState<Record<string, keyof ClaimUpsertRow>>(
    initialMapping ?? {},
  );
  const [presetName, setPresetName] = useState<string>("");

  const readiness = useMemo(() => computeReadiness(mapping), [mapping]);
  const overallPct = Math.round(readiness.overall * 100);

  const requiredFields = MAPPABLE_FIELDS.filter((f) => f.required).map((f) => f.field);
  const mappedFields = new Set(Object.values(mapping));
  const missingRequired = requiredFields.filter((f) => !mappedFields.has(f));

  const applyAutoDetect = () => {
    setMapping(autoDetectMapping(detectedHeaders));
    setPresetName("");
  };

  const applyPresetChoice = (name: string) => {
    setPresetName(name);
    const preset = HIMS_PRESETS[name];
    if (!preset) return;
    const applied = applyPreset(preset, detectedHeaders);
    // Fill gaps with auto-detect for headers the preset didn't cover
    const auto = autoDetectMapping(detectedHeaders);
    setMapping({ ...auto, ...applied });
  };

  const setHeaderMap = (header: string, value: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (value === NONE) delete next[header];
      else next[header] = value as keyof ClaimUpsertRow;
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            HIMS Field Mapping Wizard
          </DialogTitle>
          <DialogDescription>
            Map your HIMS export columns to RCMBuddy fields. Use a preset for your HIMS or let us
            auto-detect. The readiness score below shows which analytics features unlock as you map more fields.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap py-2 border-b">
          <span className="text-xs text-muted-foreground">HIMS preset:</span>
          <Select value={presetName} onValueChange={applyPresetChoice}>
            <SelectTrigger className="w-56 h-8"><SelectValue placeholder="Choose HIMS…" /></SelectTrigger>
            <SelectContent>
              {Object.keys(HIMS_PRESETS).map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={applyAutoDetect}>
            <Sparkles className="h-3 w-3 mr-1" /> Auto-detect
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMapping({})}>Clear all</Button>
          <div className="ml-auto text-xs">
            <span className="text-muted-foreground">Mapped: </span>
            <span className="font-semibold">{Object.keys(mapping).length}</span>
            <span className="text-muted-foreground"> / {detectedHeaders.length} headers</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 overflow-hidden pt-3">
          {/* Left: header → field mapping */}
          <div className="lg:col-span-3 flex flex-col min-h-0">
            <div className="text-xs font-medium mb-2">Column mappings</div>
            <ScrollArea className="flex-1 border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">HIMS column</th>
                    <th className="text-left px-3 py-2 font-medium w-64">Maps to</th>
                  </tr>
                </thead>
                <tbody>
                  {detectedHeaders.map((h) => {
                    const cur = mapping[h] ?? NONE;
                    return (
                      <tr key={h} className="border-t">
                        <td className="px-3 py-1.5 truncate max-w-xs" title={h}>{h}</td>
                        <td className="px-3 py-1">
                          <Select value={cur} onValueChange={(v) => setHeaderMap(h, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>— Ignore —</SelectItem>
                              {MAPPABLE_FIELDS.map((f) => (
                                <SelectItem key={f.field} value={f.field}>
                                  {f.label}{f.required ? " *" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </div>

          {/* Right: readiness score */}
          <div className="lg:col-span-2 flex flex-col min-h-0">
            <div className="text-xs font-medium mb-2">Data readiness</div>
            <div className="border rounded-md p-3 space-y-3 flex-1 overflow-auto">
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">Overall readiness</span>
                  <span className="text-2xl font-display tabular-nums">{overallPct}%</span>
                </div>
                <Progress value={overallPct} className="h-2 mt-1" />
                {missingRequired.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5 text-[11px] text-destructive">
                    <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>Required missing: {missingRequired.map(fieldLabel).join(", ")}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {readiness.features.map((r) => {
                  const pct = Math.round(r.score * 100);
                  const tone = pct === 100 ? "text-success" : pct >= 60 ? "text-warning" : "text-muted-foreground";
                  return (
                    <div key={r.feature.key} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium flex items-center gap-1">
                          {pct === 100 && <CheckCircle2 className="h-3 w-3 text-success" />}
                          {r.feature.name}
                        </span>
                        <span className={`tabular-nums ${tone}`}>{pct}%</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground leading-tight">{r.feature.description}</div>
                      {r.missing.length > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Map to unlock: <span className="text-foreground">{r.missing.map(fieldLabel).join(", ")}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t">
          <div className="text-xs text-muted-foreground mr-auto">
            {missingRequired.length > 0
              ? <span className="text-destructive">Map all required fields to continue.</span>
              : <span>Ready. Save to re-parse the file with this mapping.</span>}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={missingRequired.length > 0}
            onClick={() => { onSave(mapping); onOpenChange(false); }}
          >
            Save mapping & re-parse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact readiness pill for the upload page (before opening the wizard). */
export function ReadinessBadge({ mapping }: { mapping: Record<string, keyof ClaimUpsertRow> }) {
  const { overall } = computeReadiness(mapping);
  const pct = Math.round(overall * 100);
  const tone = pct >= 85 ? "bg-success/10 text-success border-success/30"
    : pct >= 60 ? "bg-warning/10 text-warning border-warning/30"
    : "bg-destructive/10 text-destructive border-destructive/30";
  return (
    <Badge variant="outline" className={`${tone} tabular-nums`}>
      Data readiness · {pct}%
    </Badge>
  );
}
