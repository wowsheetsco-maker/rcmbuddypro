import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertCircle, Sparkles, Download, Upload, HelpCircle, Ban, ClipboardCheck, TrendingUp, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { ClaimUpsertRow } from "@/lib/claimsImport";
import {
  MAPPABLE_FIELDS,
  HIMS_PRESETS,
  autoDetectMappingScored,
  applyPreset,
  computeReadiness,
  fieldLabel,
  CRITICAL_FIELDS,
  serializeTemplate,
  parseTemplate,
  buildValidationReport,
  type HeaderMatch,
  type ValidationReport,
} from "@/lib/himsFieldMapping";

type Mapping = Record<string, keyof ClaimUpsertRow>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  detectedHeaders: string[];
  /** Non-empty-value counts per detected header — powers the live population
   *  preview so users see how many claims will actually populate each field
   *  as they change the mapping. */
  headerStats?: Record<string, { filled: number; total: number }>;
  /** Total non-blank rows in the file (denominator for population %). */
  totalRows?: number;
  initialMapping?: Mapping;
  onSave: (mapping: Mapping) => void;
}

const NONE = "__none__";

export default function FieldMappingWizard({
  open,
  onOpenChange,
  detectedHeaders,
  headerStats,
  totalRows,
  initialMapping,
  onSave,
}: Props) {
  const [mapping, setMapping] = useState<Mapping>(initialMapping ?? {});
  const [presetName, setPresetName] = useState<string>("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [reportOpen, setReportOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Score headers, ignoring excluded ones so misnamed / duplicate columns
  // don't create noisy ambiguous matches.
  const scored = useMemo(
    () => autoDetectMappingScored(detectedHeaders.filter((h) => !excluded.has(h))),
    [detectedHeaders, excluded],
  );

  const readiness = useMemo(() => computeReadiness(mapping), [mapping]);
  const overallPct = Math.round(readiness.overall * 100);

  const requiredFields = MAPPABLE_FIELDS.filter((f) => f.required).map((f) => f.field);
  const mappedFields = new Set(Object.values(mapping));
  const missingRequired = requiredFields.filter((f) => !mappedFields.has(f));

  // Reverse index: target field → currently-assigned header, so the live
  // population preview knows which column feeds each critical field.
  const fieldToHeader = useMemo(() => {
    const m = new Map<keyof ClaimUpsertRow, string>();
    for (const [h, f] of Object.entries(mapping)) m.set(f, h);
    return m;
  }, [mapping]);

  const grandTotal = totalRows ?? (headerStats
    ? Math.max(...Object.values(headerStats).map((s) => s.total), 0)
    : 0);

  const populationFor = (field: keyof ClaimUpsertRow): { filled: number; total: number } | null => {
    const h = fieldToHeader.get(field);
    if (!h || !headerStats) return null;
    return headerStats[h] ?? null;
  };

  const applyAutoDetect = () => {
    setMapping(scored.mapping);
    setPresetName("");
    toast.success("Auto-detected mapping applied");
  };

  const applyPresetChoice = (name: string) => {
    setPresetName(name);
    const preset = HIMS_PRESETS[name];
    if (!preset) return;
    const applied = applyPreset(preset, detectedHeaders);
    setMapping({ ...scored.mapping, ...applied });
  };

  const setHeaderMap = (header: string, value: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (value === NONE) delete next[header];
      else next[header] = value as keyof ClaimUpsertRow;
      return next;
    });
  };

  const acceptGuess = (header: string) => {
    const m = scored.matches[header];
    if (m?.field) setHeaderMap(header, m.field);
  };

  const exportTemplate = () => {
    const name = typeof window !== "undefined"
      ? window.prompt("Name this template (e.g. 'Fortis Medixcel v3')", presetName || "Custom mapping")
      : "Custom mapping";
    if (!name) return;
    const blob = new Blob(
      [serializeTemplate({ name, hims: presetName || undefined, mapping })],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rcm-mapping-${name.toLowerCase().replace(/\s+/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Template exported: ${name}`);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const tpl = parseTemplate(text);
      // Only keep entries whose header exists in this file — normalise both
      // sides so a template shared across HIMS variants with minor casing /
      // spacing differences still applies.
      const norm = (s: string) => s.trim().toLowerCase().replace(/[._\-\/\\|#*&+,;:()"'`~?!@$%^=<>]+/g, " ").replace(/\s+/g, " ").trim();
      const byNorm = new Map(detectedHeaders.map((h) => [norm(h), h]));
      const applied: Mapping = {};
      let matchedCount = 0;
      for (const [k, v] of Object.entries(tpl.mapping)) {
        const target = byNorm.get(norm(k));
        if (target) { applied[target] = v; matchedCount += 1; }
      }
      setMapping((prev) => ({ ...prev, ...applied }));
      toast.success(`Template "${tpl.name}" imported — matched ${matchedCount} of ${Object.keys(tpl.mapping).length} columns`);
    } catch (err) {
      toast.error(`Could not import template: ${err instanceof Error ? err.message : "Invalid file"}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            HIMS Field Mapping Wizard
          </DialogTitle>
          <DialogDescription>
            Map your HIMS export columns to RCMBuddy fields. Auto-detection scores each match — confirm
            ambiguous ones, then save the mapping as a template you can reuse for future uploads.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap py-2 border-b">
          <span className="text-xs text-muted-foreground">HIMS preset:</span>
          <Select value={presetName} onValueChange={applyPresetChoice}>
            <SelectTrigger className="w-52 h-8"><SelectValue placeholder="Choose HIMS…" /></SelectTrigger>
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

          <div className="h-5 w-px bg-border mx-1" />

          <Button size="sm" variant="outline" onClick={exportTemplate} disabled={Object.keys(mapping).length === 0}>
            <Download className="h-3 w-3 mr-1" /> Export template
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = "";
            }}
          />
          <Button size="sm" variant="outline" onClick={() => importInputRef.current?.click()}>
            <Upload className="h-3 w-3 mr-1" /> Import template
          </Button>

          <div className="ml-auto text-xs">
            <span className="text-muted-foreground">Mapped: </span>
            <span className="font-semibold">{Object.keys(mapping).length}</span>
            <span className="text-muted-foreground"> / {detectedHeaders.length} headers</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 flex-1 overflow-hidden pt-3">
          {/* Left: header → field mapping with confidence + suggestions */}
          <div className="lg:col-span-3 flex flex-col min-h-0">
            <div className="text-xs font-medium mb-2 flex items-center gap-1">
              Column mappings
              <TooltipProvider><Tooltip>
                <TooltipTrigger><HelpCircle className="h-3 w-3 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Confidence badges: <b>High</b> = exact match, <b>Med</b> = keyword pattern,
                  <b> Low</b> = fuzzy label overlap. Ambiguous rows are highlighted amber — click
                  a suggestion chip to accept it.
                </TooltipContent>
              </Tooltip></TooltipProvider>
            </div>
            <ScrollArea className="flex-1 border rounded-md">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">HIMS column</th>
                    <th className="text-left px-3 py-2 font-medium w-56">Maps to</th>
                    <th className="text-left px-2 py-2 font-medium w-36">Confidence</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Populated</th>
                  </tr>
                </thead>
                <tbody>
                  {detectedHeaders.map((h) => (
                    <HeaderRow
                      key={h}
                      header={h}
                      cur={mapping[h] ?? NONE}
                      match={scored.matches[h]}
                      stats={headerStats?.[h]}
                      onChange={setHeaderMap}
                      onAccept={() => acceptGuess(h)}
                    />
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>

          {/* Right: readiness + live critical field population */}
          <div className="lg:col-span-2 flex flex-col min-h-0 gap-3">
            {/* Live population preview */}
            <div className="border rounded-md p-3">
              <div className="text-xs font-medium mb-2 flex items-center justify-between">
                <span>Live population — critical fields</span>
                <span className="text-[10px] text-muted-foreground">
                  {grandTotal.toLocaleString()} claim{grandTotal === 1 ? "" : "s"} in file
                </span>
              </div>
              <div className="space-y-1 max-h-56 overflow-auto pr-1">
                {CRITICAL_FIELDS.map((f) => {
                  const pop = populationFor(f);
                  const filled = pop?.filled ?? 0;
                  const total = pop?.total ?? grandTotal;
                  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
                  const mapped = fieldToHeader.has(f);
                  const tone = !mapped ? "bg-destructive/70"
                    : pct >= 90 ? "bg-success"
                    : pct >= 60 ? "bg-warning"
                    : "bg-destructive";
                  return (
                    <div key={f} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[11px]">
                      <div className="min-w-0">
                        <div className="truncate">{fieldLabel(f)}</div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden mt-0.5">
                          <div className={`h-full ${tone}`} style={{ width: `${mapped ? pct : 0}%` }} />
                        </div>
                      </div>
                      <div className="tabular-nums text-right whitespace-nowrap">
                        {mapped
                          ? <span className={pct >= 60 ? "text-foreground" : "text-warning"}>{filled.toLocaleString()} · {pct}%</span>
                          : <span className="text-destructive">unmapped</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Readiness score */}
            <div className="border rounded-md p-3 flex-1 overflow-auto">
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

              <div className="space-y-2 mt-3">
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

function HeaderRow({
  header, cur, match, stats, onChange, onAccept,
}: {
  header: string;
  cur: string;
  match: HeaderMatch | undefined;
  stats: { filled: number; total: number } | undefined;
  onChange: (h: string, v: string) => void;
  onAccept: () => void;
}) {
  const isAmbiguous = !!match && match.confidence > 0 && match.confidence < 0.85 && cur === NONE;
  const currentIsMapped = cur !== NONE;
  const rowTone = isAmbiguous ? "bg-warning/5" : "";

  const conf = match?.confidence ?? 0;
  const confBadge = currentIsMapped && match?.field === cur
    ? confidenceBadge(conf)
    : cur !== NONE
    ? { label: "Manual", tone: "bg-primary/10 text-primary border-primary/30" }
    : match?.field
    ? confidenceBadge(conf)
    : null;

  const pop = stats;
  const popPct = pop && pop.total > 0 ? Math.round((pop.filled / pop.total) * 100) : null;

  return (
    <>
      <tr className={`border-t ${rowTone}`}>
        <td className="px-3 py-1.5 max-w-xs">
          <div className="truncate" title={header}>{header}</div>
        </td>
        <td className="px-3 py-1">
          <Select value={cur} onValueChange={(v) => onChange(header, v)}>
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
        <td className="px-2 py-1">
          {confBadge ? (
            <Badge variant="outline" className={`${confBadge.tone} text-[10px] font-normal`} title={match?.reason}>
              {confBadge.label}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-1 text-right text-[11px] tabular-nums">
          {pop
            ? <span title={`${pop.filled} of ${pop.total} rows`}>{pop.filled.toLocaleString()}{popPct !== null && ` · ${popPct}%`}</span>
            : <span className="text-muted-foreground">—</span>}
        </td>
      </tr>
      {isAmbiguous && match && (
        <tr className="bg-warning/5">
          <td colSpan={4} className="px-3 pb-2 pt-0">
            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
              <AlertCircle className="h-3 w-3 text-warning" />
              <span className="text-muted-foreground">Ambiguous — did you mean:</span>
              {match.field && (
                <button
                  type="button"
                  onClick={onAccept}
                  className="px-1.5 py-0.5 rounded border border-warning/40 bg-background hover:bg-warning/10"
                >
                  {fieldLabel(match.field)} <span className="text-muted-foreground">({Math.round(match.confidence * 100)}%)</span>
                </button>
              )}
              {match.alternates.slice(0, 2).map((a) => (
                <button
                  key={a.field}
                  type="button"
                  onClick={() => onChange(header, a.field)}
                  className="px-1.5 py-0.5 rounded border border-border bg-background hover:bg-muted"
                >
                  {fieldLabel(a.field)} <span className="text-muted-foreground">({Math.round(a.confidence * 100)}%)</span>
                </button>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function confidenceBadge(conf: number): { label: string; tone: string } {
  if (conf >= 0.95) return { label: `High · ${Math.round(conf * 100)}%`, tone: "bg-success/10 text-success border-success/30" };
  if (conf >= 0.7)  return { label: `Med · ${Math.round(conf * 100)}%`,  tone: "bg-warning/10 text-warning border-warning/30" };
  if (conf > 0)     return { label: `Low · ${Math.round(conf * 100)}%`,  tone: "bg-destructive/10 text-destructive border-destructive/30" };
  return { label: "—", tone: "bg-muted text-muted-foreground border-border" };
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
